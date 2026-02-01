// Coordinate System Component
// Creates SVG grid, axes, and handles coordinate transformations

export class CoordinateSystem {
    constructor(svg, config = {}) {
        this.svg = svg;
        this.config = {
            // Real-world units (meters)
            gridSpacing: config.gridSpacing || 0.5,      // minor grid (m)
            majorGridEvery: config.majorGridEvery || 2,  // major grid every N minor
            // View settings
            pixelsPerMeter: config.pixelsPerMeter || 50,
            // Bounds (in meters)
            minX: config.minX || -2,
            maxX: config.maxX || 10,
            minY: config.minY || -1,
            maxY: config.maxY || 8,
        };

        this.gridGroup = null;
        this.axisGroup = null;
        this.visible = true;

        this.init();
    }

    init() {
        // Create defs for patterns
        this.createDefs();

        // Create groups in correct z-order
        this.gridGroup = this.svg.append('g').attr('class', 'grid-group');
        this.axisGroup = this.svg.append('g').attr('class', 'axis-group');

        this.render();
    }

    createDefs() {
        const defs = this.svg.append('defs');

        // Soil hatch pattern
        const soilPattern = defs.append('pattern')
            .attr('id', 'soil-pattern')
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', 10)
            .attr('height', 10);

        soilPattern.append('rect')
            .attr('width', 10)
            .attr('height', 10)
            .attr('fill', '#d4c4a8');

        soilPattern.append('circle')
            .attr('cx', 2).attr('cy', 2).attr('r', 1)
            .attr('fill', '#a89880');
        soilPattern.append('circle')
            .attr('cx', 7).attr('cy', 6).attr('r', 1.2)
            .attr('fill', '#a89880');
        soilPattern.append('circle')
            .attr('cx', 5).attr('cy', 9).attr('r', 0.8)
            .attr('fill', '#a89880');

        // Arrow marker
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('markerWidth', 10)
            .attr('markerHeight', 7)
            .attr('refX', 9)
            .attr('refY', 3.5)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3.5, 0 7')
            .attr('fill', '#e94560');

        // Dimension arrow markers
        defs.append('marker')
            .attr('id', 'dim-arrow-start')
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('refX', 0)
            .attr('refY', 4)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M8,0 L0,4 L8,8')
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 1);

        defs.append('marker')
            .attr('id', 'dim-arrow-end')
            .attr('markerWidth', 8)
            .attr('markerHeight', 8)
            .attr('refX', 8)
            .attr('refY', 4)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,0 L8,4 L0,8')
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 1);
    }

    // Convert real-world coords (m) to SVG pixels
    toPixel(x, y) {
        const px = (x - this.config.minX) * this.config.pixelsPerMeter;
        // Y is inverted in SVG (0 at top)
        const py = (this.config.maxY - y) * this.config.pixelsPerMeter;
        return { x: px, y: py };
    }

    // Convert SVG pixels to real-world coords (m)
    toWorld(px, py) {
        const x = px / this.config.pixelsPerMeter + this.config.minX;
        const y = this.config.maxY - py / this.config.pixelsPerMeter;
        return { x, y };
    }

    // Get SVG dimensions
    getSvgSize() {
        return {
            width: (this.config.maxX - this.config.minX) * this.config.pixelsPerMeter,
            height: (this.config.maxY - this.config.minY) * this.config.pixelsPerMeter
        };
    }

    render() {
        this.renderGrid();
        this.renderAxes();
    }

    renderGrid() {
        this.gridGroup.selectAll('*').remove();

        if (!this.visible) return;

        const { gridSpacing, majorGridEvery, minX, maxX, minY, maxY } = this.config;

        // Vertical lines
        for (let x = Math.ceil(minX / gridSpacing) * gridSpacing; x <= maxX; x += gridSpacing) {
            const isMajor = Math.abs(x % (gridSpacing * majorGridEvery)) < 0.001;
            const p1 = this.toPixel(x, minY);
            const p2 = this.toPixel(x, maxY);

            this.gridGroup.append('line')
                .attr('class', isMajor ? 'grid-line-major' : 'grid-line')
                .attr('x1', p1.x).attr('y1', p1.y)
                .attr('x2', p2.x).attr('y2', p2.y);
        }

        // Horizontal lines
        for (let y = Math.ceil(minY / gridSpacing) * gridSpacing; y <= maxY; y += gridSpacing) {
            const isMajor = Math.abs(y % (gridSpacing * majorGridEvery)) < 0.001;
            const p1 = this.toPixel(minX, y);
            const p2 = this.toPixel(maxX, y);

            this.gridGroup.append('line')
                .attr('class', isMajor ? 'grid-line-major' : 'grid-line')
                .attr('x1', p1.x).attr('y1', p1.y)
                .attr('x2', p2.x).attr('y2', p2.y);
        }
    }

    renderAxes() {
        this.axisGroup.selectAll('*').remove();

        const { minX, maxX, minY, maxY, gridSpacing, majorGridEvery } = this.config;
        const origin = this.toPixel(0, 0);

        // X axis
        const xStart = this.toPixel(minX, 0);
        const xEnd = this.toPixel(maxX, 0);
        this.axisGroup.append('line')
            .attr('class', 'axis-line')
            .attr('x1', xStart.x).attr('y1', origin.y)
            .attr('x2', xEnd.x).attr('y2', origin.y);

        // Y axis
        const yStart = this.toPixel(0, minY);
        const yEnd = this.toPixel(0, maxY);
        this.axisGroup.append('line')
            .attr('class', 'axis-line')
            .attr('x1', origin.x).attr('y1', yStart.y)
            .attr('x2', origin.x).attr('y2', yEnd.y);

        // Origin marker
        this.axisGroup.append('circle')
            .attr('class', 'origin-marker')
            .attr('cx', origin.x)
            .attr('cy', origin.y)
            .attr('r', 5);

        // Axis labels
        const labelSpacing = gridSpacing * majorGridEvery;

        // X axis labels
        for (let x = Math.ceil(minX / labelSpacing) * labelSpacing; x <= maxX; x += labelSpacing) {
            if (Math.abs(x) < 0.001) continue; // Skip origin
            const p = this.toPixel(x, 0);
            this.axisGroup.append('text')
                .attr('class', 'axis-label')
                .attr('x', p.x)
                .attr('y', p.y + 15)
                .attr('text-anchor', 'middle')
                .text(x.toFixed(1));
        }

        // Y axis labels
        for (let y = Math.ceil(minY / labelSpacing) * labelSpacing; y <= maxY; y += labelSpacing) {
            if (Math.abs(y) < 0.001) continue; // Skip origin
            const p = this.toPixel(0, y);
            this.axisGroup.append('text')
                .attr('class', 'axis-label')
                .attr('x', p.x - 10)
                .attr('y', p.y + 4)
                .attr('text-anchor', 'end')
                .text(y.toFixed(1));
        }

        // Origin label
        this.axisGroup.append('text')
            .attr('class', 'axis-label')
            .attr('x', origin.x - 10)
            .attr('y', origin.y + 15)
            .attr('text-anchor', 'end')
            .text('0');
    }

    setVisible(visible) {
        this.visible = visible;
        this.gridGroup.style('display', visible ? 'block' : 'none');
    }

    setAxesVisible(visible) {
        this.axisGroup.style('display', visible ? 'block' : 'none');
    }
}
