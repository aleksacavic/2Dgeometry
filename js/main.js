// Retaining Wall Designer - Main Application
// SVG + D3.js based engineering drawing tool

import { CoordinateSystem } from './components/coordinateSystem.js';
import { LWall } from './components/lWall.js';
import { BlockWall } from './components/blockWall.js';
import { SoilWedge } from './components/soilWedge.js';
import { DimensionLine, createVerticalDimension, createHorizontalDimension } from './components/dimensionLine.js';

class RetainingWallApp {
    constructor() {
        this.elements = [];
        this.selectedElement = null;
        this.dimensions = [];
        this.coordSystem = null;
        this.svg = null;

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
        this.svg.on('click', () => {
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
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedElement) {
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
        const walls = this.elements.filter(e => e instanceof LWall || e instanceof BlockWall);

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

            const typeName = el.constructor.name.replace(/([A-Z])/g, ' $1').trim();
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
                    if (element instanceof LWall || element instanceof BlockWall) {
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
