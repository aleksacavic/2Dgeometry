// Retaining Wall Designer - Main Application
// SVG + D3.js based engineering drawing tool

import { CoordinateSystem } from './components/coordinateSystem.js';
import { LWall } from './components/lWall.js';
import { BlockWall } from './components/blockWall.js';
import { SoilWedge } from './components/soilWedge.js';
import { DimensionLine, createVerticalDimension, createHorizontalDimension } from './components/dimensionLine.js';
import { CustomPolygon, createLShape } from './components/customPolygon.js';
import { DrawingTool } from './components/drawingTool.js';
import { BlenderBridge, BlenderCrossSection } from './components/blenderBridge.js';

class RetainingWallApp {
    constructor() {
        this.elements = [];
        this.selectedElement = null;
        this.dimensions = [];
        this.coordSystem = null;
        this.svg = null;
        this.drawingTool = null;
        this.blenderBridge = null;
        this.blenderObjects = [];

        // Layer groups (z-order)
        this.layers = {
            soil: null,
            walls: null,
            dimensions: null,
            annotations: null,
        };

        this.init();
    }

    init() {
        this.createSvg();
        this.setupCoordinateSystem();
        this.setupLayers();
        this.setupDrawingTool();
        this.setupBlenderBridge();
        this.bindControls();
        this.bindKeyboard();

        // Add a default example
        this.addDefaultExample();
    }

    createSvg() {
        const container = d3.select('#drawing-area');
        const rect = container.node().getBoundingClientRect();

        this.svg = container.append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${rect.width} ${rect.height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        // Enable zoom/pan
        const zoom = d3.zoom()
            .scaleExtent([0.5, 5])
            .on('zoom', (event) => {
                this.mainGroup.attr('transform', event.transform);
                this.updateZoomLevel(event.transform.k);
            });

        this.svg.call(zoom);

        // Main group for all content
        this.mainGroup = this.svg.append('g').attr('class', 'main-group');

        // Track mouse position
        this.svg.on('mousemove', (event) => {
            const [px, py] = d3.pointer(event, this.mainGroup.node());
            if (this.coordSystem) {
                const world = this.coordSystem.toWorld(px, py);
                document.getElementById('cursor-coords').textContent =
                    `X: ${world.x.toFixed(2)}m, Y: ${world.y.toFixed(2)}m`;
            }
        });

        // Deselect on background click
        this.svg.on('click', (event) => {
            // Don't deselect if drawing tool is active
            if (this.drawingTool && this.drawingTool.isActive()) return;
            this.deselectAll();
        });
    }

    setupCoordinateSystem() {
        const container = document.getElementById('drawing-area');
        const rect = container.getBoundingClientRect();

        // Calculate appropriate scale
        const worldWidth = 12;  // meters
        const worldHeight = 10;
        const pixelsPerMeter = Math.min(rect.width / worldWidth, rect.height / worldHeight) * 0.9;

        this.coordSystem = new CoordinateSystem(this.mainGroup, {
            pixelsPerMeter,
            minX: -2,
            maxX: 10,
            minY: -1,
            maxY: 8,
            gridSpacing: 0.5,
            majorGridEvery: 2,
        });
    }

    setupLayers() {
        // Create layer groups in z-order
        this.layers.soil = this.mainGroup.append('g').attr('class', 'layer-soil');
        this.layers.walls = this.mainGroup.append('g').attr('class', 'layer-walls');
        this.layers.dimensions = this.mainGroup.append('g').attr('class', 'layer-dimensions');
        this.layers.annotations = this.mainGroup.append('g').attr('class', 'layer-annotations');
    }

    setupDrawingTool() {
        this.drawingTool = new DrawingTool(this.coordSystem, this.svg, this.mainGroup, {
            gridSnap: true,
            gridSize: 0.1,
            onComplete: (result) => this.handleDrawingComplete(result),
            onCancel: () => this.updateDrawingUI(false),
        });
    }

    setupBlenderBridge() {
        this.blenderBridge = new BlenderBridge({
            onConnect: () => this.updateBlenderStatus('connected'),
            onDisconnect: () => this.updateBlenderStatus('disconnected'),
            onError: (error) => {
                console.error('Blender connection error:', error);
                this.updateBlenderStatus('disconnected');
            },
            onCrossSection: (data) => this.handleBlenderCrossSection(data),
            onObjectList: (objects) => this.updateBlenderObjectList(objects),
        });

        // Bind Blender UI controls
        this.bindBlenderControls();
    }

    bindBlenderControls() {
        const connectBtn = document.getElementById('blender-connect');
        const refreshBtn = document.getElementById('blender-refresh');
        const hostInput = document.getElementById('blender-host');
        const getSectionBtn = document.getElementById('blender-get-section');
        const objectSelect = document.getElementById('blender-object-select');
        const cutYInput = document.getElementById('blender-cut-y');

        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                if (this.blenderBridge.isConnected()) {
                    this.blenderBridge.disconnect();
                    connectBtn.textContent = 'Connect';
                } else {
                    const hostPort = hostInput.value.split(':');
                    this.blenderBridge.host = hostPort[0] || 'localhost';
                    this.blenderBridge.port = parseInt(hostPort[1]) || 8765;

                    this.updateBlenderStatus('connecting');
                    try {
                        await this.blenderBridge.connect();
                        connectBtn.textContent = 'Disconnect';
                        // Get object list on connect
                        await this.blenderBridge.getObjects();
                    } catch (error) {
                        console.error('Failed to connect:', error);
                        this.updateBlenderStatus('disconnected');
                    }
                }
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                if (this.blenderBridge.isConnected()) {
                    await this.blenderBridge.getObjects();
                }
            });
        }

        if (getSectionBtn) {
            getSectionBtn.addEventListener('click', async () => {
                if (!this.blenderBridge.isConnected()) return;

                const objectName = objectSelect.value;
                const cutY = parseFloat(cutYInput.value) || 0;

                if (objectName) {
                    await this.blenderBridge.getCrossSection(objectName, cutY, 'Y');
                }
            });
        }
    }

    updateBlenderStatus(status) {
        const statusEl = document.getElementById('blender-status');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('span:last-child');
        const refreshBtn = document.getElementById('blender-refresh');
        const objectsDiv = document.getElementById('blender-objects');

        dot.className = 'status-dot ' + status;

        switch (status) {
            case 'connected':
                text.textContent = 'Connected';
                refreshBtn.disabled = false;
                objectsDiv.style.display = 'block';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                refreshBtn.disabled = true;
                break;
            case 'disconnected':
            default:
                text.textContent = 'Disconnected';
                refreshBtn.disabled = true;
                objectsDiv.style.display = 'none';
                break;
        }
    }

    updateBlenderObjectList(objects) {
        const select = document.getElementById('blender-object-select');
        select.innerHTML = '';

        this.blenderObjects = objects;

        objects.forEach(obj => {
            const option = document.createElement('option');
            option.value = obj.name;
            option.textContent = `${obj.name} (${obj.bounds ?
                `${obj.bounds.size.x.toFixed(1)}x${obj.bounds.size.y.toFixed(1)}x${obj.bounds.size.z.toFixed(1)}` :
                'unknown size'})`;
            select.appendChild(option);
        });

        if (objects.length > 0) {
            // Auto-update cut plane range based on first object
            const obj = objects[0];
            if (obj.bounds) {
                const cutInput = document.getElementById('blender-cut-y');
                cutInput.value = obj.bounds.center.y.toFixed(2);
                cutInput.min = obj.bounds.min.y;
                cutInput.max = obj.bounds.max.y;
            }
        }
    }

    handleBlenderCrossSection(data) {
        if (!data.polygons || data.polygons.length === 0) {
            console.warn('No cross-section data received');
            return;
        }

        // Check if we already have a cross-section for this object
        let existing = this.elements.find(el =>
            el instanceof BlenderCrossSection && el.params.objectName === data.object
        );

        if (existing) {
            existing.updateFromBlender(data);
        } else {
            // Create new cross-section element
            const crossSection = new BlenderCrossSection(this.coordSystem, this.layers.walls, {
                objectName: data.object,
                polygons: data.polygons,
                volume: data.volume,
                bounds: data.bounds,
                cutPosition: data.cut_position || data.plane_position,
                onSelect: (el) => this.selectElement(el),
                onUpdate: () => this.updateDimensions(),
            });

            this.elements.push(crossSection);
            this.updateElementList();
            this.selectElement(crossSection);
        }

        this.updateDimensions();
    }

    handleDrawingComplete(result) {
        this.updateDrawingUI(false);

        if (result.vertices.length < 3) return;

        // Determine type from options
        const type = result.options.type || 'polygon';
        let fillColor = '#90A4AE';
        let name = 'Custom Shape';

        if (type === 'wall') {
            fillColor = '#78909C';
            name = 'Custom Wall';
        } else if (type === 'soil') {
            fillColor = '#8D6E63';
            name = 'Custom Soil';
        }

        const polygon = new CustomPolygon(this.coordSystem, this.layers.walls, {
            vertices: result.vertices,
            type,
            fillColor,
            name,
            onSelect: (el) => this.selectElement(el),
            onUpdate: () => this.updateDimensions(),
        });

        this.elements.push(polygon);
        this.updateElementList();
        this.selectElement(polygon);
        this.updateDimensions();
    }

    updateDrawingUI(isDrawing) {
        const buttons = document.querySelectorAll('.btn-draw');
        buttons.forEach(btn => {
            btn.classList.toggle('active', isDrawing);
        });

        // Update status
        const statusText = isDrawing ? 'Drawing mode - Click to place vertices' : '';
        const statusEl = document.getElementById('drawing-status');
        if (statusEl) {
            statusEl.textContent = statusText;
        }
    }

    bindControls() {
        // Add L-Wall button
        document.getElementById('add-lwall').addEventListener('click', () => {
            this.addLWall();
        });

        // Add Block Wall button
        document.getElementById('add-blockwall').addEventListener('click', () => {
            this.addBlockWall();
        });

        // Add Soil button
        document.getElementById('add-soil').addEventListener('click', () => {
            this.addSoilWedge();
        });

        // Draw custom wall button
        const drawWallBtn = document.getElementById('draw-wall');
        if (drawWallBtn) {
            drawWallBtn.addEventListener('click', () => {
                this.deselectAll();
                this.drawingTool.start('polygon', { type: 'wall' });
                this.updateDrawingUI(true);
            });
        }

        // Draw custom polygon button
        const drawPolygonBtn = document.getElementById('draw-polygon');
        if (drawPolygonBtn) {
            drawPolygonBtn.addEventListener('click', () => {
                this.deselectAll();
                this.drawingTool.start('polygon', { type: 'polygon' });
                this.updateDrawingUI(true);
            });
        }

        // Draw custom soil button
        const drawSoilBtn = document.getElementById('draw-soil');
        if (drawSoilBtn) {
            drawSoilBtn.addEventListener('click', () => {
                this.deselectAll();
                this.drawingTool.start('polygon', { type: 'soil' });
                this.updateDrawingUI(true);
            });
        }

        // View toggles
        document.getElementById('show-grid').addEventListener('change', (e) => {
            this.coordSystem.setVisible(e.target.checked);
        });

        document.getElementById('show-dimensions').addEventListener('change', (e) => {
            this.layers.dimensions.style('display', e.target.checked ? 'block' : 'none');
        });

        document.getElementById('show-coords').addEventListener('change', (e) => {
            this.coordSystem.setAxesVisible(e.target.checked);
        });

        // Reset view
        document.getElementById('reset-view').addEventListener('click', () => {
            this.svg.transition().duration(500).call(
                d3.zoom().transform,
                d3.zoomIdentity
            );
        });
    }

    bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't handle if drawing tool is active (it has its own handlers)
            if (this.drawingTool && this.drawingTool.isActive()) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedElement && !e.target.matches('input')) {
                    this.deleteElement(this.selectedElement);
                }
            }
            if (e.key === 'Escape') {
                this.deselectAll();
            }
        });
    }

    updateZoomLevel(scale) {
        document.getElementById('zoom-level').textContent = `Zoom: ${Math.round(scale * 100)}%`;
    }

    // Element management
    addLWall(config = {}) {
        const defaults = {
            originX: 0,
            originY: 0,
            baseWidth: 2.5,
            baseThickness: 0.4,
            toeLength: 0.6,
            stemHeight: 3.0,
            stemThicknessBot: 0.35,
            stemThicknessTop: 0.25,
        };

        const wall = new LWall(this.coordSystem, this.layers.walls, {
            ...defaults,
            ...config,
            onSelect: (el) => this.selectElement(el),
            onUpdate: () => this.updateDimensions(),
        });

        this.elements.push(wall);
        this.updateElementList();
        this.selectElement(wall);
        this.updateDimensions();

        return wall;
    }

    addBlockWall(config = {}) {
        const defaults = {
            originX: 0,
            originY: 0,
            blockWidth: 0.45,
            blockHeight: 0.2,
            setback: 0.02,
            numCourses: 8,
        };

        const wall = new BlockWall(this.coordSystem, this.layers.walls, {
            ...defaults,
            ...config,
            onSelect: (el) => this.selectElement(el),
            onUpdate: () => this.updateDimensions(),
        });

        this.elements.push(wall);
        this.updateElementList();
        this.selectElement(wall);
        this.updateDimensions();

        return wall;
    }

    addSoilWedge(config = {}) {
        // Find the last wall to attach to
        const walls = this.elements.filter(e =>
            e instanceof LWall || e instanceof BlockWall || e instanceof CustomPolygon || e instanceof BlenderCrossSection
        );

        let attachConfig = {};
        if (walls.length > 0) {
            const lastWall = walls[walls.length - 1];
            const backFace = lastWall.getBackFace();
            attachConfig = {
                wallBackBottom: backFace.bottom,
                wallBackTop: backFace.top,
            };
        } else {
            attachConfig = {
                wallBackBottom: { x: 0.5, y: 0 },
                wallBackTop: { x: 0.5, y: 3 },
            };
        }

        const defaults = {
            frictionAngle: 30,
            unitWeight: 18,
            backfillSlope: 0,
            soilExtent: 5,
        };

        const soil = new SoilWedge(this.coordSystem, this.layers.soil, {
            ...defaults,
            ...attachConfig,
            ...config,
            onSelect: (el) => this.selectElement(el),
            onUpdate: () => this.updateDimensions(),
        });

        this.elements.push(soil);
        this.updateElementList();
        this.selectElement(soil);

        return soil;
    }

    addCustomPolygon(config = {}) {
        const polygon = new CustomPolygon(this.coordSystem, this.layers.walls, {
            ...config,
            onSelect: (el) => this.selectElement(el),
            onUpdate: () => this.updateDimensions(),
        });

        this.elements.push(polygon);
        this.updateElementList();
        this.selectElement(polygon);
        this.updateDimensions();

        return polygon;
    }

    selectElement(element) {
        this.deselectAll();
        this.selectedElement = element;
        element.setSelected(true);
        this.showPropertyPanel(element);
        this.updateElementList();
    }

    deselectAll() {
        if (this.selectedElement) {
            this.selectedElement.setSelected(false);
        }
        this.selectedElement = null;
        this.hidePropertyPanel();
        this.updateElementList();
    }

    deleteElement(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            element.destroy();
            this.elements.splice(index, 1);
            this.deselectAll();
            this.updateElementList();
            this.updateDimensions();
        }
    }

    updateElementList() {
        const list = document.getElementById('element-list');
        list.innerHTML = '';

        this.elements.forEach((el, index) => {
            const li = document.createElement('li');
            li.className = el === this.selectedElement ? 'selected' : '';

            let typeName;
            if (el instanceof CustomPolygon) {
                typeName = el.params.name || 'Custom Shape';
            } else if (el instanceof BlenderCrossSection) {
                typeName = `Blender: ${el.params.objectName}`;
            } else {
                typeName = el.constructor.name.replace(/([A-Z])/g, ' $1').trim();
            }

            li.innerHTML = `
                <span>${typeName} ${index + 1}</span>
                <button class="delete-btn" data-index="${index}">&times;</button>
            `;

            li.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-btn')) {
                    this.selectElement(el);
                }
            });

            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteElement(el);
            });

            list.appendChild(li);
        });
    }

    showPropertyPanel(element) {
        const panel = document.getElementById('element-properties');
        const inputs = document.getElementById('property-inputs');
        panel.style.display = 'block';
        inputs.innerHTML = '';

        const params = element.getParams();
        const editableParams = this.getEditableParams(element);

        // Add vertex info for custom polygons
        if (element instanceof CustomPolygon) {
            const vertexInfo = document.createElement('div');
            vertexInfo.className = 'input-group vertex-info';
            vertexInfo.innerHTML = `
                <p><strong>Vertices:</strong> ${params.vertices.length}</p>
                <p class="hint">Drag blue handles to edit vertices</p>
            `;
            inputs.appendChild(vertexInfo);
        }

        // Add Blender info
        if (element instanceof BlenderCrossSection) {
            const blenderInfo = document.createElement('div');
            blenderInfo.className = 'input-group vertex-info';
            blenderInfo.innerHTML = `
                <p><strong>Object:</strong> ${params.objectName}</p>
                <p><strong>Volume:</strong> ${params.volume.toFixed(3)} m³</p>
                <p><strong>Cut Y:</strong> ${params.cutPosition.toFixed(2)} m</p>
                <p><strong>Polygons:</strong> ${params.polygons.length}</p>
            `;
            inputs.appendChild(blenderInfo);
        }

        editableParams.forEach(({ key, label, step, unit }) => {
            const value = params[key];
            if (typeof value === 'number') {
                const div = document.createElement('div');
                div.className = 'input-group';
                div.innerHTML = `
                    <label>
                        <span>${label}${unit ? ` (${unit})` : ''}</span>
                        <input type="number" data-param="${key}" value="${value}" step="${step || 0.1}">
                    </label>
                `;

                div.querySelector('input').addEventListener('change', (e) => {
                    const newValue = parseFloat(e.target.value);
                    element.updateParams({ [key]: newValue });

                    // Update soil if wall changed
                    if (element instanceof LWall || element instanceof BlockWall || element instanceof CustomPolygon) {
                        this.updateAttachedSoil(element);
                    }
                });

                inputs.appendChild(div);
            } else if (typeof value === 'boolean') {
                const div = document.createElement('div');
                div.className = 'input-group';
                div.innerHTML = `
                    <label>
                        <input type="checkbox" data-param="${key}" ${value ? 'checked' : ''}>
                        ${label}
                    </label>
                `;

                div.querySelector('input').addEventListener('change', (e) => {
                    element.updateParams({ [key]: e.target.checked });
                });

                inputs.appendChild(div);
            }
        });
    }

    getEditableParams(element) {
        if (element instanceof LWall) {
            return [
                { key: 'originX', label: 'Origin X', step: 0.1, unit: 'm' },
                { key: 'originY', label: 'Origin Y', step: 0.1, unit: 'm' },
                { key: 'baseWidth', label: 'Base Width', step: 0.1, unit: 'm' },
                { key: 'baseThickness', label: 'Base Thickness', step: 0.05, unit: 'm' },
                { key: 'toeLength', label: 'Toe Length', step: 0.1, unit: 'm' },
                { key: 'stemHeight', label: 'Stem Height', step: 0.1, unit: 'm' },
                { key: 'stemThicknessBot', label: 'Stem Thick. (Bot)', step: 0.05, unit: 'm' },
                { key: 'stemThicknessTop', label: 'Stem Thick. (Top)', step: 0.05, unit: 'm' },
            ];
        } else if (element instanceof BlockWall) {
            return [
                { key: 'originX', label: 'Origin X', step: 0.1, unit: 'm' },
                { key: 'originY', label: 'Origin Y', step: 0.1, unit: 'm' },
                { key: 'blockWidth', label: 'Block Width', step: 0.05, unit: 'm' },
                { key: 'blockHeight', label: 'Block Height', step: 0.05, unit: 'm' },
                { key: 'setback', label: 'Setback/Course', step: 0.01, unit: 'm' },
                { key: 'numCourses', label: 'Number of Courses', step: 1 },
            ];
        } else if (element instanceof SoilWedge) {
            return [
                { key: 'frictionAngle', label: 'Friction Angle', step: 1, unit: '°' },
                { key: 'unitWeight', label: 'Unit Weight', step: 0.5, unit: 'kN/m³' },
                { key: 'backfillSlope', label: 'Backfill Slope', step: 1, unit: '°' },
                { key: 'soilExtent', label: 'Soil Extent', step: 0.5, unit: 'm' },
                { key: 'showFailurePlane', label: 'Show Failure Plane' },
                { key: 'showPressureDiagram', label: 'Show Pressure Diagram' },
            ];
        } else if (element instanceof CustomPolygon) {
            return [
                { key: 'fillOpacity', label: 'Fill Opacity', step: 0.1 },
                { key: 'strokeWidth', label: 'Stroke Width', step: 0.5 },
            ];
        } else if (element instanceof BlenderCrossSection) {
            return [
                { key: 'offsetX', label: 'Offset X', step: 0.1, unit: 'm' },
                { key: 'offsetY', label: 'Offset Y', step: 0.1, unit: 'm' },
                { key: 'scale', label: 'Scale', step: 0.1 },
                { key: 'fillOpacity', label: 'Fill Opacity', step: 0.1 },
            ];
        }
        return [];
    }

    hidePropertyPanel() {
        document.getElementById('element-properties').style.display = 'none';
    }

    updateAttachedSoil(wall) {
        // Find any soil wedges and update them
        const soils = this.elements.filter(e => e instanceof SoilWedge);
        soils.forEach(soil => {
            const backFace = wall.getBackFace();
            soil.updateParams({
                wallBackBottom: backFace.bottom,
                wallBackTop: backFace.top,
            });
        });
    }

    updateDimensions() {
        // Clear existing dimensions
        this.dimensions.forEach(d => d.destroy());
        this.dimensions = [];

        // Add dimensions for each wall
        const walls = this.elements.filter(e => e instanceof LWall || e instanceof BlockWall);

        walls.forEach(wall => {
            const params = wall.getParams();

            if (wall instanceof LWall) {
                // Base width dimension
                this.dimensions.push(createHorizontalDimension(
                    this.coordSystem,
                    this.layers.dimensions,
                    params.originY,
                    params.originX,
                    params.originX + params.baseWidth,
                    -0.4
                ));

                // Total height dimension
                this.dimensions.push(createVerticalDimension(
                    this.coordSystem,
                    this.layers.dimensions,
                    params.originX,
                    params.originY,
                    params.originY + params.baseThickness + params.stemHeight,
                    -0.5
                ));

            } else if (wall instanceof BlockWall) {
                // Total height
                const totalHeight = params.numCourses * params.blockHeight;
                this.dimensions.push(createVerticalDimension(
                    this.coordSystem,
                    this.layers.dimensions,
                    params.originX,
                    params.originY,
                    params.originY + totalHeight,
                    -0.4
                ));

                // Block width
                this.dimensions.push(createHorizontalDimension(
                    this.coordSystem,
                    this.layers.dimensions,
                    params.originY,
                    params.originX,
                    params.originX + params.blockWidth,
                    -0.3
                ));
            }
        });

        // Add dimensions for custom polygons
        const customPolygons = this.elements.filter(e => e instanceof CustomPolygon);
        customPolygons.forEach(poly => {
            const bounds = poly.getBounds();
            // Width dimension
            this.dimensions.push(createHorizontalDimension(
                this.coordSystem,
                this.layers.dimensions,
                bounds.minY,
                bounds.minX,
                bounds.maxX,
                -0.3
            ));
            // Height dimension
            this.dimensions.push(createVerticalDimension(
                this.coordSystem,
                this.layers.dimensions,
                bounds.minX,
                bounds.minY,
                bounds.maxY,
                -0.4
            ));
        });
    }

    addDefaultExample() {
        // Add a block wall example
        this.addBlockWall({
            originX: 0,
            originY: 0,
            blockWidth: 0.45,
            blockHeight: 0.2,
            setback: 0.015,
            numCourses: 10,
        });

        // Add soil wedge
        this.addSoilWedge({
            frictionAngle: 32,
            unitWeight: 18,
            backfillSlope: 5,
            soilExtent: 4,
        });

        this.deselectAll();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RetainingWallApp();
});
