// L-Wall (Cantilever Retaining Wall) Component
// Geometry: inverted T-shape with stem and base

export class LWall {
    constructor(coordSystem, elementsGroup, config = {}) {
        this.coordSystem = coordSystem;
        this.elementsGroup = elementsGroup;
        this.id = config.id || `lwall-${Date.now()}`;

        // Geometry parameters (in meters)
        // Origin is at bottom-left outer corner of toe
        this.params = {
            // Base (footing)
            baseWidth: config.baseWidth || 2.5,      // total base width
            baseThickness: config.baseThickness || 0.4,
            toeLength: config.toeLength || 0.6,      // length in front of stem

            // Stem (wall)
            stemHeight: config.stemHeight || 3.0,
            stemThicknessBot: config.stemThicknessBot || 0.35,  // at base
            stemThicknessTop: config.stemThicknessTop || 0.25,  // at top (can taper)

            // Position (origin point in world coords)
            originX: config.originX || 0,
            originY: config.originY || 0,
        };

        this.selected = false;
        this.group = null;
        this.onSelect = config.onSelect || (() => {});
        this.onUpdate = config.onUpdate || (() => {});

        this.render();
    }

    // Get the polygon points for the L-wall shape
    getPolygonPoints() {
        const p = this.params;
        const ox = p.originX;
        const oy = p.originY;

        // Calculate key positions
        const heelLength = p.baseWidth - p.toeLength - p.stemThicknessBot;

        // Points going clockwise from bottom-left (origin)
        return [
            { x: ox, y: oy },                                           // 0: bottom-left (toe)
            { x: ox + p.baseWidth, y: oy },                            // 1: bottom-right (heel)
            { x: ox + p.baseWidth, y: oy + p.baseThickness },          // 2: top of heel
            { x: ox + p.toeLength + p.stemThicknessBot, y: oy + p.baseThickness }, // 3: inner heel corner
            { x: ox + p.toeLength + p.stemThicknessTop, y: oy + p.baseThickness + p.stemHeight }, // 4: top-right of stem
            { x: ox + p.toeLength, y: oy + p.baseThickness + p.stemHeight }, // 5: top-left of stem
            { x: ox + p.toeLength, y: oy + p.baseThickness },          // 6: inner toe corner
            { x: ox, y: oy + p.baseThickness },                        // 7: top of toe
        ];
    }

    // Get back face of wall (for soil interaction)
    getBackFace() {
        const points = this.getPolygonPoints();
        return {
            bottom: points[3],  // inner heel corner at base
            top: points[4],     // top-right of stem
        };
    }

    // Get top of wall
    getTopElevation() {
        return this.params.originY + this.params.baseThickness + this.params.stemHeight;
    }

    render() {
        // Remove existing
        if (this.group) {
            this.group.remove();
        }

        this.group = this.elementsGroup.append('g')
            .attr('class', 'wall-element l-wall')
            .attr('data-id', this.id);

        const points = this.getPolygonPoints();
        const pixelPoints = points.map(p => this.coordSystem.toPixel(p.x, p.y));
        const pathData = 'M' + pixelPoints.map(p => `${p.x},${p.y}`).join(' L') + ' Z';

        // Main wall shape
        this.group.append('path')
            .attr('class', 'wall-fill')
            .attr('d', pathData);

        // Add concrete texture lines
        this.addTextureLines(pixelPoints);

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

        this.updateSelection();
    }

    addTextureLines(pixelPoints) {
        // Add some horizontal lines to suggest concrete
        const p = this.params;
        const numLines = Math.floor(p.stemHeight / 0.5);

        for (let i = 1; i <= numLines; i++) {
            const y = p.originY + p.baseThickness + (i * 0.5);
            if (y >= p.originY + p.baseThickness + p.stemHeight) break;

            // Calculate x positions at this height (accounting for taper)
            const ratio = (y - p.originY - p.baseThickness) / p.stemHeight;
            const thickness = p.stemThicknessBot + ratio * (p.stemThicknessTop - p.stemThicknessBot);
            const xLeft = p.originX + p.toeLength;
            const xRight = xLeft + thickness;

            const pLeft = this.coordSystem.toPixel(xLeft, y);
            const pRight = this.coordSystem.toPixel(xRight, y);

            this.group.append('line')
                .attr('x1', pLeft.x).attr('y1', pLeft.y)
                .attr('x2', pRight.x).attr('y2', pRight.y)
                .attr('stroke', '#606060')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.5);
        }
    }

    setSelected(selected) {
        this.selected = selected;
        this.updateSelection();
    }

    updateSelection() {
        this.group.classed('selected', this.selected);
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
            type: 'l-wall',
            id: this.id,
            params: this.params
        };
    }

    destroy() {
        if (this.group) {
            this.group.remove();
        }
    }
}
