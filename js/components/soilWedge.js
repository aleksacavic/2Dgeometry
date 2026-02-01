// Soil Wedge Component
// Represents the active/passive soil wedge behind a retaining wall
// Includes failure plane and optional pressure diagram

export class SoilWedge {
    constructor(coordSystem, elementsGroup, config = {}) {
        this.coordSystem = coordSystem;
        this.elementsGroup = elementsGroup;
        this.id = config.id || `soil-${Date.now()}`;

        // Geometry parameters
        this.params = {
            // Soil properties
            frictionAngle: config.frictionAngle || 30,  // degrees
            cohesion: config.cohesion || 0,             // kPa
            unitWeight: config.unitWeight || 18,        // kN/m³
            surchageLoad: config.surchargeLoad || 0,    // kPa

            // Geometry - defined by wall back face
            wallBackBottom: config.wallBackBottom || { x: 0.5, y: 0 },
            wallBackTop: config.wallBackTop || { x: 0.5, y: 3 },

            // Backfill slope angle (from horizontal, degrees)
            backfillSlope: config.backfillSlope || 0,

            // Extent of soil (how far back to draw)
            soilExtent: config.soilExtent || 5,

            // Show options
            showFailurePlane: config.showFailurePlane !== false,
            showPressureDiagram: config.showPressureDiagram !== false,
        };

        this.selected = false;
        this.group = null;
        this.onSelect = config.onSelect || (() => {});
        this.onUpdate = config.onUpdate || (() => {});

        this.render();
    }

    // Calculate active earth pressure coefficient (Rankine)
    getKa() {
        const phi = this.params.frictionAngle * Math.PI / 180;
        const beta = this.params.backfillSlope * Math.PI / 180;

        // Rankine Ka for sloped backfill
        const cosBeta = Math.cos(beta);
        const cosPhi = Math.cos(phi);

        const Ka = cosBeta * (cosBeta - Math.sqrt(cosBeta * cosBeta - cosPhi * cosPhi)) /
                   (cosBeta + Math.sqrt(cosBeta * cosBeta - cosPhi * cosPhi));

        return Ka;
    }

    // Get failure plane angle from horizontal
    getFailurePlaneAngle() {
        return 45 + this.params.frictionAngle / 2;
    }

    // Get the polygon points for the soil wedge
    getSoilPolygon() {
        const p = this.params;
        const bottom = p.wallBackBottom;
        const top = p.wallBackTop;

        const slopeRad = p.backfillSlope * Math.PI / 180;
        const wallHeight = top.y - bottom.y;

        // Points: wall back face + backfill surface + ground
        const points = [];

        // Bottom of wall
        points.push({ x: bottom.x, y: bottom.y });

        // Top of wall (back face)
        points.push({ x: top.x, y: top.y });

        // Backfill surface extends back
        const surfaceEndX = top.x + p.soilExtent;
        const surfaceEndY = top.y + Math.tan(slopeRad) * p.soilExtent;
        points.push({ x: surfaceEndX, y: surfaceEndY });

        // Ground level at the back (assuming level with wall bottom)
        points.push({ x: surfaceEndX, y: bottom.y });

        return points;
    }

    // Get failure plane line
    getFailurePlane() {
        const p = this.params;
        const bottom = p.wallBackBottom;
        const top = p.wallBackTop;

        const failureAngle = this.getFailurePlaneAngle() * Math.PI / 180;
        const wallHeight = top.y - bottom.y;

        // Failure plane starts at bottom of wall and goes up at failure angle
        const failureLength = wallHeight / Math.sin(failureAngle);
        const failureEndX = bottom.x + failureLength * Math.cos(failureAngle);
        const failureEndY = bottom.y + failureLength * Math.sin(failureAngle);

        return {
            start: { x: bottom.x, y: bottom.y },
            end: { x: failureEndX, y: failureEndY }
        };
    }

    // Get pressure diagram points (triangular distribution)
    getPressureDiagram() {
        const p = this.params;
        const bottom = p.wallBackBottom;
        const top = p.wallBackTop;

        const Ka = this.getKa();
        const wallHeight = top.y - bottom.y;

        // Pressure at bottom = Ka * gamma * H
        const pressureAtBottom = Ka * p.unitWeight * wallHeight;

        // Surcharge pressure (constant over height)
        const surcharePressure = Ka * p.surchageLoad;

        // Scale factor for display (pressure in kPa to meters for display)
        const pressureScale = 0.03;  // 1 kPa = 0.03m display width

        // Points for pressure diagram
        const points = [];

        // Along wall face (from top to bottom)
        points.push({ x: top.x, y: top.y });
        points.push({ x: bottom.x, y: bottom.y });

        // Pressure at bottom
        const maxPressure = pressureAtBottom + surcharePressure;
        points.push({ x: bottom.x + maxPressure * pressureScale, y: bottom.y });

        // Pressure at top (only surcharge if present)
        points.push({ x: top.x + surcharePressure * pressureScale, y: top.y });

        return {
            points,
            pressureAtBottom,
            pressureAtTop: surcharePressure,
            Ka
        };
    }

    render() {
        if (this.group) {
            this.group.remove();
        }

        this.group = this.elementsGroup.append('g')
            .attr('class', 'wall-element soil-wedge')
            .attr('data-id', this.id);

        // Draw soil mass
        this.renderSoilMass();

        // Draw failure plane
        if (this.params.showFailurePlane) {
            this.renderFailurePlane();
        }

        // Draw pressure diagram
        if (this.params.showPressureDiagram) {
            this.renderPressureDiagram();
        }

        // Interaction
        this.group
            .on('click', (event) => {
                event.stopPropagation();
                this.onSelect(this);
            });

        this.updateSelection();
    }

    renderSoilMass() {
        const points = this.getSoilPolygon();
        const pixelPoints = points.map(p => this.coordSystem.toPixel(p.x, p.y));
        const pathData = 'M' + pixelPoints.map(p => `${p.x},${p.y}`).join(' L') + ' Z';

        this.group.append('path')
            .attr('class', 'soil-fill')
            .attr('d', pathData);

        // Ground surface line
        const top = this.params.wallBackTop;
        const surfaceEnd = {
            x: top.x + this.params.soilExtent,
            y: top.y + Math.tan(this.params.backfillSlope * Math.PI / 180) * this.params.soilExtent
        };

        const p1 = this.coordSystem.toPixel(top.x, top.y);
        const p2 = this.coordSystem.toPixel(surfaceEnd.x, surfaceEnd.y);

        this.group.append('line')
            .attr('x1', p1.x).attr('y1', p1.y)
            .attr('x2', p2.x).attr('y2', p2.y)
            .attr('stroke', '#2d5016')
            .attr('stroke-width', 3);
    }

    renderFailurePlane() {
        const failurePlane = this.getFailurePlane();
        const p1 = this.coordSystem.toPixel(failurePlane.start.x, failurePlane.start.y);
        const p2 = this.coordSystem.toPixel(failurePlane.end.x, failurePlane.end.y);

        this.group.append('line')
            .attr('class', 'failure-plane')
            .attr('x1', p1.x).attr('y1', p1.y)
            .attr('x2', p2.x).attr('y2', p2.y);

        // Add angle label
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const angle = this.getFailurePlaneAngle();

        this.group.append('text')
            .attr('x', midX + 10)
            .attr('y', midY - 10)
            .attr('fill', '#e94560')
            .attr('font-size', '11px')
            .text(`${angle.toFixed(0)}°`);
    }

    renderPressureDiagram() {
        const pressure = this.getPressureDiagram();
        const pixelPoints = pressure.points.map(p => this.coordSystem.toPixel(p.x, p.y));
        const pathData = 'M' + pixelPoints.map(p => `${p.x},${p.y}`).join(' L') + ' Z';

        this.group.append('path')
            .attr('class', 'pressure-diagram')
            .attr('d', pathData);

        // Add pressure arrows
        const numArrows = 5;
        const bottom = this.params.wallBackBottom;
        const top = this.params.wallBackTop;
        const wallHeight = top.y - bottom.y;

        for (let i = 0; i <= numArrows; i++) {
            const ratio = i / numArrows;
            const y = top.y - ratio * wallHeight;
            const x = top.x;

            // Interpolate pressure
            const pressureAtPoint = pressure.pressureAtTop +
                ratio * (pressure.pressureAtBottom - pressure.pressureAtTop);
            const arrowLength = pressureAtPoint * 0.03;

            if (arrowLength > 0.05) {
                const pStart = this.coordSystem.toPixel(x + arrowLength, y);
                const pEnd = this.coordSystem.toPixel(x, y);

                this.group.append('line')
                    .attr('x1', pStart.x).attr('y1', pStart.y)
                    .attr('x2', pEnd.x).attr('y2', pEnd.y)
                    .attr('stroke', '#e94560')
                    .attr('stroke-width', 2)
                    .attr('marker-end', 'url(#arrowhead)');
            }
        }

        // Pressure label at bottom
        const labelPos = this.coordSystem.toPixel(
            bottom.x + pressure.pressureAtBottom * 0.03 + 0.2,
            bottom.y + 0.2
        );
        this.group.append('text')
            .attr('x', labelPos.x)
            .attr('y', labelPos.y)
            .attr('fill', '#e94560')
            .attr('font-size', '10px')
            .text(`${pressure.pressureAtBottom.toFixed(1)} kPa`);
    }

    setSelected(selected) {
        this.selected = selected;
        this.updateSelection();
    }

    updateSelection() {
        this.group.classed('selected', this.selected);
    }

    // Attach to a wall element
    attachToWall(wall) {
        const backFace = wall.getBackFace();
        this.params.wallBackBottom = backFace.bottom;
        this.params.wallBackTop = backFace.top;
        this.render();
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
            type: 'soil-wedge',
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
