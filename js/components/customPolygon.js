// Custom Polygon Component
// Allows drawing arbitrary polygons with draggable vertices

import { VertexHandleManager } from './vertexHandle.js';

export class CustomPolygon {
    constructor(coordSystem, layer, config = {}) {
        this.coordSystem = coordSystem;
        this.layer = layer;
        this.id = config.id || `polygon-${Date.now()}`;
        this.type = config.type || 'polygon';  // 'polygon', 'wall', 'soil'

        this.params = {
            vertices: config.vertices || [],
            fillColor: config.fillColor || '#90A4AE',
            strokeColor: config.strokeColor || '#455A64',
            fillOpacity: config.fillOpacity || 0.7,
            strokeWidth: config.strokeWidth || 2,
            closed: config.closed !== false,
            name: config.name || 'Custom Shape',
        };

        this.selected = false;
        this.group = null;
        this.polygon = null;

        this.onSelect = config.onSelect || (() => {});
        this.onUpdate = config.onUpdate || (() => {});

        // Vertex handle manager
        this.handleManager = new VertexHandleManager(coordSystem, layer);

        if (this.params.vertices.length > 0) {
            this.render();
        }
    }

    render() {
        if (this.group) {
            this.group.remove();
        }

        this.group = this.layer.append('g')
            .attr('class', `custom-polygon ${this.type}`)
            .attr('data-id', this.id);

        // Build path from vertices
        const pathData = this.buildPath();

        // Main shape
        this.polygon = this.group.append('path')
            .attr('class', 'polygon-fill')
            .attr('d', pathData)
            .attr('fill', this.params.fillColor)
            .attr('fill-opacity', this.params.fillOpacity)
            .attr('stroke', this.params.strokeColor)
            .attr('stroke-width', this.params.strokeWidth)
            .style('cursor', 'pointer');

        // Click handler
        this.polygon.on('click', (event) => {
            event.stopPropagation();
            this.onSelect(this);
        });

        // Update vertex handles
        this.updateHandles();
    }

    buildPath() {
        if (this.params.vertices.length === 0) return '';

        const pixels = this.params.vertices.map(v =>
            this.coordSystem.toPixel(v.x, v.y)
        );

        let d = `M ${pixels[0].x} ${pixels[0].y}`;
        for (let i = 1; i < pixels.length; i++) {
            d += ` L ${pixels[i].x} ${pixels[i].y}`;
        }
        if (this.params.closed) {
            d += ' Z';
        }

        return d;
    }

    updateHandles() {
        this.handleManager.setVertices(
            this.params.vertices,
            (index, pos, final) => this.handleVertexMove(index, pos, final)
        );
        this.handleManager.setVisible(this.selected);
    }

    handleVertexMove(index, pos, final = false) {
        this.params.vertices[index] = { x: pos.x, y: pos.y };

        // Update path
        const pathData = this.buildPath();
        this.polygon.attr('d', pathData);

        if (final) {
            this.onUpdate();
        }
    }

    addVertex(x, y, index = null) {
        const vertex = { x, y };
        if (index === null) {
            this.params.vertices.push(vertex);
        } else {
            this.params.vertices.splice(index, 0, vertex);
        }
        this.render();
        this.onUpdate();
    }

    removeVertex(index) {
        if (this.params.vertices.length > 3) {
            this.params.vertices.splice(index, 1);
            this.render();
            this.onUpdate();
        }
    }

    setSelected(selected) {
        this.selected = selected;
        this.handleManager.setVisible(selected);

        if (this.polygon) {
            this.polygon
                .attr('stroke', selected ? '#2196F3' : this.params.strokeColor)
                .attr('stroke-width', selected ? 3 : this.params.strokeWidth);
        }
    }

    getParams() {
        return { ...this.params };
    }

    updateParams(newParams) {
        Object.assign(this.params, newParams);
        this.render();
        this.onUpdate();
    }

    getVertices() {
        return this.params.vertices.map(v => ({ ...v }));
    }

    setVertices(vertices) {
        this.params.vertices = vertices.map(v => ({ ...v }));
        this.render();
    }

    // Get back face for soil attachment (rightmost edge)
    getBackFace() {
        if (this.params.vertices.length < 2) {
            return { bottom: { x: 0, y: 0 }, top: { x: 0, y: 1 } };
        }

        // Find rightmost vertices (top and bottom)
        const sorted = [...this.params.vertices].sort((a, b) => b.x - a.x);
        const rightX = sorted[0].x;
        const rightVerts = this.params.vertices.filter(v => Math.abs(v.x - rightX) < 0.01);

        if (rightVerts.length >= 2) {
            rightVerts.sort((a, b) => a.y - b.y);
            return {
                bottom: rightVerts[0],
                top: rightVerts[rightVerts.length - 1]
            };
        }

        // Fallback: use bounding box
        const minY = Math.min(...this.params.vertices.map(v => v.y));
        const maxY = Math.max(...this.params.vertices.map(v => v.y));
        return {
            bottom: { x: rightX, y: minY },
            top: { x: rightX, y: maxY }
        };
    }

    getBounds() {
        if (this.params.vertices.length === 0) {
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        }
        return {
            minX: Math.min(...this.params.vertices.map(v => v.x)),
            maxX: Math.max(...this.params.vertices.map(v => v.x)),
            minY: Math.min(...this.params.vertices.map(v => v.y)),
            maxY: Math.max(...this.params.vertices.map(v => v.y)),
        };
    }

    destroy() {
        this.handleManager.destroy();
        if (this.group) {
            this.group.remove();
        }
    }
}

// Preset polygon shapes
export function createRectangle(coordSystem, layer, config = {}) {
    const x = config.x || 0;
    const y = config.y || 0;
    const width = config.width || 1;
    const height = config.height || 1;

    return new CustomPolygon(coordSystem, layer, {
        ...config,
        vertices: [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
        ]
    });
}

export function createTrapezoid(coordSystem, layer, config = {}) {
    const x = config.x || 0;
    const y = config.y || 0;
    const bottomWidth = config.bottomWidth || 1;
    const topWidth = config.topWidth || 0.6;
    const height = config.height || 1;
    const offset = (bottomWidth - topWidth) / 2;

    return new CustomPolygon(coordSystem, layer, {
        ...config,
        vertices: [
            { x, y },
            { x: x + bottomWidth, y },
            { x: x + bottomWidth - offset, y: y + height },
            { x: x + offset, y: y + height },
        ]
    });
}

export function createLShape(coordSystem, layer, config = {}) {
    const x = config.x || 0;
    const y = config.y || 0;
    const baseWidth = config.baseWidth || 2;
    const baseHeight = config.baseHeight || 0.4;
    const stemWidth = config.stemWidth || 0.4;
    const stemHeight = config.stemHeight || 2;
    const toeLength = config.toeLength || 0.5;

    return new CustomPolygon(coordSystem, layer, {
        ...config,
        type: 'wall',
        fillColor: config.fillColor || '#78909C',
        vertices: [
            { x, y },                                          // bottom-left (toe)
            { x: x + baseWidth, y },                           // bottom-right (heel)
            { x: x + baseWidth, y: y + baseHeight },           // heel top
            { x: x + toeLength + stemWidth, y: y + baseHeight }, // stem right bottom
            { x: x + toeLength + stemWidth, y: y + baseHeight + stemHeight }, // stem right top
            { x: x + toeLength, y: y + baseHeight + stemHeight }, // stem left top
            { x: x + toeLength, y: y + baseHeight },           // stem left bottom
            { x, y: y + baseHeight },                          // toe top
        ]
    });
}
