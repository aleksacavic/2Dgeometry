// Block Wall (Gravity/Segmental Retaining Wall) Component
// Stacked blocks with setback

import { VertexHandleManager } from './vertexHandle.js';

export class BlockWall {
    constructor(coordSystem, elementsGroup, config = {}) {
        this.coordSystem = coordSystem;
        this.elementsGroup = elementsGroup;
        this.id = config.id || `blockwall-${Date.now()}`;

        // Geometry parameters (in meters)
        this.params = {
            // Block dimensions
            blockWidth: config.blockWidth || 0.45,
            blockHeight: config.blockHeight || 0.2,
            setback: config.setback || 0.02,  // setback per course

            // Wall configuration
            numCourses: config.numCourses || 8,
            embedDepth: config.embedDepth || 0.2,  // below ground

            // Position (origin at bottom-front of lowest block)
            originX: config.originX || 0,
            originY: config.originY || 0,
        };

        this.selected = false;
        this.group = null;
        this.onSelect = config.onSelect || (() => {});
        this.onUpdate = config.onUpdate || (() => {});

        // Vertex editing - simplified control points for block wall
        this.handleManager = new VertexHandleManager(coordSystem, elementsGroup);

        this.render();
    }

    // Get simplified control points (corners for easier manipulation)
    getControlPoints() {
        const p = this.params;
        const totalHeight = p.numCourses * p.blockHeight;
        const topSetback = (p.numCourses - 1) * p.setback;

        return [
            { x: p.originX, y: p.originY },                                    // 0: bottom-left
            { x: p.originX + p.blockWidth, y: p.originY },                     // 1: bottom-right
            { x: p.originX + topSetback + p.blockWidth, y: p.originY + totalHeight }, // 2: top-right
            { x: p.originX + topSetback, y: p.originY + totalHeight },         // 3: top-left
        ];
    }

    handleVertexDrag(index, pos, final) {
        const p = this.params;
        const totalHeight = p.numCourses * p.blockHeight;

        switch (index) {
            case 0: // bottom-left (origin)
                p.originX = pos.x;
                p.originY = pos.y;
                break;
            case 1: // bottom-right
                p.blockWidth = pos.x - p.originX;
                break;
            case 2: // top-right
                const newHeight = pos.y - p.originY;
                p.numCourses = Math.max(1, Math.round(newHeight / p.blockHeight));
                break;
            case 3: // top-left
                const newHeight2 = pos.y - p.originY;
                p.numCourses = Math.max(1, Math.round(newHeight2 / p.blockHeight));
                // Adjust setback based on horizontal position
                const expectedX = p.originX + (p.numCourses - 1) * p.setback;
                const diff = pos.x - expectedX;
                if (p.numCourses > 1) {
                    p.setback = Math.max(0, p.setback + diff / (p.numCourses - 1));
                }
                break;
        }

        // Clamp values
        p.blockWidth = Math.max(0.2, p.blockWidth);
        p.blockHeight = Math.max(0.1, p.blockHeight);
        p.setback = Math.max(0, Math.min(p.setback, 0.1));
        p.numCourses = Math.max(1, Math.min(p.numCourses, 30));

        this.render();
        if (final) {
            this.onUpdate(this);
        }
    }

    // Get array of block rectangles
    getBlocks() {
        const p = this.params;
        const blocks = [];

        for (let i = 0; i < p.numCourses; i++) {
            const totalSetback = i * p.setback;
            blocks.push({
                x: p.originX + totalSetback,
                y: p.originY + i * p.blockHeight,
                width: p.blockWidth,
                height: p.blockHeight,
                course: i
            });
        }

        return blocks;
    }

    // Get outer polygon (stepped profile)
    getOuterPolygon() {
        const p = this.params;
        const points = [];

        // Start at bottom-left
        points.push({ x: p.originX, y: p.originY });

        // Go up the front face (steps)
        for (let i = 0; i < p.numCourses; i++) {
            const setback = i * p.setback;
            const y = p.originY + i * p.blockHeight;
            const yTop = y + p.blockHeight;

            if (i > 0) {
                // Step in
                points.push({ x: p.originX + setback, y: y });
            }
            points.push({ x: p.originX + setback, y: yTop });
        }

        // Top of wall, go to back
        const topSetback = (p.numCourses - 1) * p.setback;
        points.push({ x: p.originX + topSetback + p.blockWidth, y: p.originY + p.numCourses * p.blockHeight });

        // Go down the back face (straight)
        points.push({ x: p.originX + p.blockWidth, y: p.originY });

        return points;
    }

    // Get back face of wall
    getBackFace() {
        const p = this.params;
        const topSetback = (p.numCourses - 1) * p.setback;
        return {
            bottom: { x: p.originX + p.blockWidth, y: p.originY },
            top: { x: p.originX + topSetback + p.blockWidth, y: p.originY + p.numCourses * p.blockHeight }
        };
    }

    getTopElevation() {
        return this.params.originY + this.params.numCourses * this.params.blockHeight;
    }

    getTotalHeight() {
        return this.params.numCourses * this.params.blockHeight;
    }

    render() {
        if (this.group) {
            this.group.remove();
        }

        this.group = this.elementsGroup.append('g')
            .attr('class', 'wall-element block-wall')
            .attr('data-id', this.id);

        const blocks = this.getBlocks();

        // Draw each block
        blocks.forEach((block, index) => {
            const topLeft = this.coordSystem.toPixel(block.x, block.y + block.height);
            const size = {
                width: block.width * this.coordSystem.config.pixelsPerMeter,
                height: block.height * this.coordSystem.config.pixelsPerMeter
            };

            // Block rectangle
            const blockGroup = this.group.append('g')
                .attr('class', 'block')
                .attr('data-course', block.course);

            // Fill
            blockGroup.append('rect')
                .attr('class', 'wall-fill')
                .attr('x', topLeft.x)
                .attr('y', topLeft.y)
                .attr('width', size.width)
                .attr('height', size.height);

            // Texture - horizontal line in middle
            const midY = topLeft.y + size.height / 2;
            blockGroup.append('line')
                .attr('class', 'block-line')
                .attr('x1', topLeft.x + 5)
                .attr('y1', midY)
                .attr('x2', topLeft.x + size.width - 5)
                .attr('y2', midY)
                .attr('opacity', 0.4);

            // Add slight color variation
            const shade = 0.9 + (index % 3) * 0.05;
            blockGroup.select('.wall-fill')
                .style('fill', `rgb(${Math.floor(160 * shade)}, ${Math.floor(82 * shade)}, ${Math.floor(45 * shade)})`);
        });

        // Draw course lines (horizontal joints)
        for (let i = 1; i < this.params.numCourses; i++) {
            const y = this.params.originY + i * this.params.blockHeight;
            const setbackThis = i * this.params.setback;
            const setbackPrev = (i - 1) * this.params.setback;

            const p1 = this.coordSystem.toPixel(this.params.originX + setbackThis, y);
            const p2 = this.coordSystem.toPixel(this.params.originX + setbackPrev + this.params.blockWidth, y);

            this.group.append('line')
                .attr('class', 'block-line')
                .attr('x1', p1.x).attr('y1', p1.y)
                .attr('x2', p2.x).attr('y2', p2.y);
        }

        // Interaction
        this.group
            .on('click', (event) => {
                event.stopPropagation();
                this.onSelect(this);
            })
            .on('mouseenter', () => {
                this.group.style('filter', 'brightness(1.1)');
            })
            .on('mouseleave', () => {
                this.group.style('filter', 'none');
            });

        // Setup vertex handles with control points
        const controlPoints = this.getControlPoints();
        this.handleManager.setVertices(controlPoints, (index, pos, final) => {
            this.handleVertexDrag(index, pos, final);
        });

        this.updateSelection();
    }

    setSelected(selected) {
        this.selected = selected;
        this.updateSelection();
        this.handleManager.setVisible(selected);
    }

    updateSelection() {
        this.group.classed('selected', this.selected);
    }

    getVertices() {
        return this.getControlPoints();
    }

    updateParams(newParams) {
        Object.assign(this.params, newParams);
        this.render();
        this.onUpdate(this);
    }

    getParams() {
        return { ...this.params };
    }

    toJSON() {
        return {
            type: 'block-wall',
            id: this.id,
            params: this.params
        };
    }

    destroy() {
        this.handleManager.destroy();
        if (this.group) {
            this.group.remove();
        }
    }
}
