// Dimension Line Component
// Creates annotated dimension lines with measurements

export class DimensionLine {
    constructor(coordSystem, dimensionsGroup, config = {}) {
        this.coordSystem = coordSystem;
        this.dimensionsGroup = dimensionsGroup;
        this.id = config.id || `dim-${Date.now()}`;

        this.params = {
            start: config.start || { x: 0, y: 0 },
            end: config.end || { x: 1, y: 0 },
            offset: config.offset || 0.3,        // offset from the line being dimensioned
            orientation: config.orientation || 'auto',  // 'horizontal', 'vertical', 'aligned', 'auto'
            unit: config.unit || 'm',
            precision: config.precision || 2,
            showValue: config.showValue !== false,
            customLabel: config.customLabel || null,
        };

        this.group = null;
        this.render();
    }

    getMeasurement() {
        const dx = this.params.end.x - this.params.start.x;
        const dy = this.params.end.y - this.params.start.y;

        switch (this.params.orientation) {
            case 'horizontal':
                return Math.abs(dx);
            case 'vertical':
                return Math.abs(dy);
            case 'aligned':
            case 'auto':
            default:
                return Math.sqrt(dx * dx + dy * dy);
        }
    }

    getLabel() {
        if (this.params.customLabel) {
            return this.params.customLabel;
        }
        const value = this.getMeasurement();
        return `${value.toFixed(this.params.precision)} ${this.params.unit}`;
    }

    // Calculate dimension line geometry
    getDimensionGeometry() {
        const { start, end, offset, orientation } = this.params;

        let dimStart, dimEnd, extensionStart1, extensionEnd1, extensionStart2, extensionEnd2;

        if (orientation === 'horizontal') {
            // Horizontal dimension
            const y = Math.max(start.y, end.y) + offset;
            dimStart = { x: start.x, y };
            dimEnd = { x: end.x, y };
            extensionStart1 = start;
            extensionEnd1 = { x: start.x, y: y + 0.1 };
            extensionStart2 = end;
            extensionEnd2 = { x: end.x, y: y + 0.1 };

        } else if (orientation === 'vertical') {
            // Vertical dimension
            const x = Math.max(start.x, end.x) + offset;
            dimStart = { x, y: start.y };
            dimEnd = { x, y: end.y };
            extensionStart1 = start;
            extensionEnd1 = { x: x + 0.1, y: start.y };
            extensionStart2 = end;
            extensionEnd2 = { x: x + 0.1, y: end.y };

        } else {
            // Aligned (along the line) - with perpendicular offset
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            // Perpendicular unit vector
            const perpX = -dy / length;
            const perpY = dx / length;

            dimStart = { x: start.x + perpX * offset, y: start.y + perpY * offset };
            dimEnd = { x: end.x + perpX * offset, y: end.y + perpY * offset };

            extensionStart1 = start;
            extensionEnd1 = { x: dimStart.x + perpX * 0.1, y: dimStart.y + perpY * 0.1 };
            extensionStart2 = end;
            extensionEnd2 = { x: dimEnd.x + perpX * 0.1, y: dimEnd.y + perpY * 0.1 };
        }

        return {
            dimStart,
            dimEnd,
            extension1: { start: extensionStart1, end: extensionEnd1 },
            extension2: { start: extensionStart2, end: extensionEnd2 }
        };
    }

    render() {
        if (this.group) {
            this.group.remove();
        }

        this.group = this.dimensionsGroup.append('g')
            .attr('class', 'dimension')
            .attr('data-id', this.id);

        const geom = this.getDimensionGeometry();

        // Extension lines
        [geom.extension1, geom.extension2].forEach(ext => {
            const p1 = this.coordSystem.toPixel(ext.start.x, ext.start.y);
            const p2 = this.coordSystem.toPixel(ext.end.x, ext.end.y);

            this.group.append('line')
                .attr('class', 'dimension-line')
                .attr('x1', p1.x).attr('y1', p1.y)
                .attr('x2', p2.x).attr('y2', p2.y)
                .attr('stroke-dasharray', '2,2');
        });

        // Main dimension line with arrows
        const dStart = this.coordSystem.toPixel(geom.dimStart.x, geom.dimStart.y);
        const dEnd = this.coordSystem.toPixel(geom.dimEnd.x, geom.dimEnd.y);

        this.group.append('line')
            .attr('class', 'dimension-line')
            .attr('x1', dStart.x).attr('y1', dStart.y)
            .attr('x2', dEnd.x).attr('y2', dEnd.y)
            .attr('marker-start', 'url(#dim-arrow-start)')
            .attr('marker-end', 'url(#dim-arrow-end)');

        // Tick marks at ends
        const tickLength = 5;
        const dx = dEnd.x - dStart.x;
        const dy = dEnd.y - dStart.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / length * tickLength;
        const perpY = dx / length * tickLength;

        // Start tick
        this.group.append('line')
            .attr('class', 'dimension-tick')
            .attr('x1', dStart.x - perpX).attr('y1', dStart.y - perpY)
            .attr('x2', dStart.x + perpX).attr('y2', dStart.y + perpY);

        // End tick
        this.group.append('line')
            .attr('class', 'dimension-tick')
            .attr('x1', dEnd.x - perpX).attr('y1', dEnd.y - perpY)
            .attr('x2', dEnd.x + perpX).attr('y2', dEnd.y + perpY);

        // Label
        if (this.params.showValue) {
            const midX = (dStart.x + dEnd.x) / 2;
            const midY = (dStart.y + dEnd.y) / 2;

            // Background for text
            const label = this.getLabel();
            const textWidth = label.length * 7;

            this.group.append('rect')
                .attr('x', midX - textWidth / 2 - 2)
                .attr('y', midY - 8)
                .attr('width', textWidth + 4)
                .attr('height', 14)
                .attr('fill', 'white');

            this.group.append('text')
                .attr('class', 'dimension-text')
                .attr('x', midX)
                .attr('y', midY + 4)
                .text(label);
        }
    }

    update(newParams) {
        Object.assign(this.params, newParams);
        this.render();
    }

    destroy() {
        if (this.group) {
            this.group.remove();
        }
    }
}

// Helper function to create common dimension types
export function createVerticalDimension(coordSystem, group, x, y1, y2, offset = -0.5) {
    return new DimensionLine(coordSystem, group, {
        start: { x, y: y1 },
        end: { x, y: y2 },
        offset,
        orientation: 'vertical'
    });
}

export function createHorizontalDimension(coordSystem, group, y, x1, x2, offset = -0.3) {
    return new DimensionLine(coordSystem, group, {
        start: { x: x1, y },
        end: { x: x2, y },
        offset,
        orientation: 'horizontal'
    });
}
