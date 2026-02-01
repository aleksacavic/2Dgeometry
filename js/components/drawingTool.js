// Drawing Tool Component
// Allows interactive vertex placement and polygon creation

export class DrawingTool {
    constructor(coordSystem, svg, mainGroup, config = {}) {
        this.coordSystem = coordSystem;
        this.svg = svg;
        this.mainGroup = mainGroup;

        this.active = false;
        this.mode = null;  // 'polygon', 'line', 'point'
        this.vertices = [];
        this.previewGroup = null;
        this.overlayRect = null;
        this.currentMousePos = { x: 0, y: 0 };

        this.onComplete = config.onComplete || (() => {});
        this.onCancel = config.onCancel || (() => {});

        this.snapDistance = config.snapDistance || 0.1;  // meters
        this.snapEnabled = config.snapEnabled !== false;
        this.gridSnap = config.gridSnap !== false;
        this.gridSize = config.gridSize || 0.1;

        this.setupPreviewLayer();
    }

    setupPreviewLayer() {
        this.previewGroup = this.mainGroup.append('g')
            .attr('class', 'drawing-preview')
            .style('pointer-events', 'none');
    }

    start(mode = 'polygon', options = {}) {
        this.active = true;
        this.mode = mode;
        this.vertices = [];
        this.options = options;

        // Change cursor
        this.svg.style('cursor', 'crosshair');

        // Create an overlay rect to capture all mouse events during drawing
        // This sits on top of everything and captures clicks
        const svgNode = this.svg.node();
        const bbox = svgNode.getBoundingClientRect();

        this.overlayRect = this.mainGroup.append('rect')
            .attr('class', 'drawing-overlay')
            .attr('x', -10000)
            .attr('y', -10000)
            .attr('width', 20000)
            .attr('height', 20000)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair');

        // Setup event handlers on the overlay
        this.overlayRect.on('click', (event) => this.handleClick(event));
        this.overlayRect.on('mousemove', (event) => this.handleMouseMove(event));

        // Key handler on document
        this.keyHandler = (event) => this.handleKeyDown(event);
        document.addEventListener('keydown', this.keyHandler);

        // Show initial instructions
        this.updatePreview();
    }

    stop() {
        this.active = false;
        this.mode = null;
        this.vertices = [];

        // Restore cursor
        this.svg.style('cursor', null);

        // Remove overlay
        if (this.overlayRect) {
            this.overlayRect.remove();
            this.overlayRect = null;
        }

        // Remove key handler
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }

        this.clearPreview();
    }

    handleClick(event) {
        if (!this.active) return;

        event.stopPropagation();
        event.preventDefault();

        const [px, py] = d3.pointer(event, this.mainGroup.node());
        let world = this.coordSystem.toWorld(px, py);

        // Apply snapping
        world = this.applySnapping(world);

        // Check for closing the polygon (click near first vertex)
        if (this.vertices.length >= 3 && this.mode === 'polygon') {
            const first = this.vertices[0];
            const dist = Math.sqrt(
                Math.pow(world.x - first.x, 2) +
                Math.pow(world.y - first.y, 2)
            );
            if (dist < this.snapDistance * 2) {
                this.complete();
                return;
            }
        }

        // Add vertex
        this.vertices.push({ x: world.x, y: world.y });
        this.updatePreview();

        // For point mode, complete immediately
        if (this.mode === 'point') {
            this.complete();
        }
    }

    handleMouseMove(event) {
        if (!this.active) return;

        const [px, py] = d3.pointer(event, this.mainGroup.node());
        let world = this.coordSystem.toWorld(px, py);

        // Apply snapping
        world = this.applySnapping(world);
        this.currentMousePos = world;

        this.updatePreview();
    }

    handleKeyDown(event) {
        if (!this.active) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.cancel();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.vertices.length >= 3) {
                this.complete();
            }
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            // Only handle if not in an input field
            if (event.target.tagName !== 'INPUT') {
                event.preventDefault();
                // Remove last vertex
                if (this.vertices.length > 0) {
                    this.vertices.pop();
                    this.updatePreview();
                }
            }
        }
    }

    applySnapping(world) {
        let snapped = { ...world };

        // Grid snap
        if (this.gridSnap) {
            snapped.x = Math.round(snapped.x / this.gridSize) * this.gridSize;
            snapped.y = Math.round(snapped.y / this.gridSize) * this.gridSize;
        }

        // Snap to existing vertices
        if (this.snapEnabled && this.vertices.length > 0) {
            for (const v of this.vertices) {
                const dist = Math.sqrt(
                    Math.pow(world.x - v.x, 2) +
                    Math.pow(world.y - v.y, 2)
                );
                if (dist < this.snapDistance) {
                    snapped = { ...v };
                    break;
                }
            }
        }

        return snapped;
    }

    updatePreview() {
        this.clearPreview();

        if (!this.active) return;

        // Always show instructions
        let instructions = '';
        if (this.vertices.length === 0) {
            instructions = 'Click to place first vertex';
        } else if (this.vertices.length < 3) {
            instructions = `${this.vertices.length} vertices - Click to add more (min 3)`;
        } else {
            instructions = `${this.vertices.length} vertices - Click start to close, Enter to finish`;
        }

        // Instructions background
        this.previewGroup.append('rect')
            .attr('x', 5)
            .attr('y', 10)
            .attr('width', instructions.length * 7 + 10)
            .attr('height', 24)
            .attr('fill', 'rgba(255,255,255,0.9)')
            .attr('rx', 4);

        this.previewGroup.append('text')
            .attr('x', 10)
            .attr('y', 28)
            .attr('fill', '#333')
            .attr('font-size', '14px')
            .attr('font-family', 'sans-serif')
            .text(instructions);

        if (this.vertices.length === 0) return;

        const allPoints = [...this.vertices];
        if (this.mode === 'polygon' || this.mode === 'line') {
            allPoints.push(this.currentMousePos);
        }

        // Draw preview polygon/line
        if (allPoints.length >= 2) {
            const pixels = allPoints.map(v => this.coordSystem.toPixel(v.x, v.y));

            let d = `M ${pixels[0].x} ${pixels[0].y}`;
            for (let i = 1; i < pixels.length; i++) {
                d += ` L ${pixels[i].x} ${pixels[i].y}`;
            }

            // Close polygon preview if near start
            if (this.mode === 'polygon' && this.vertices.length >= 3) {
                const first = this.vertices[0];
                const dist = Math.sqrt(
                    Math.pow(this.currentMousePos.x - first.x, 2) +
                    Math.pow(this.currentMousePos.y - first.y, 2)
                );
                if (dist < this.snapDistance * 2) {
                    d += ' Z';
                }
            }

            this.previewGroup.append('path')
                .attr('d', d)
                .attr('fill', this.mode === 'polygon' ? 'rgba(33, 150, 243, 0.2)' : 'none')
                .attr('stroke', '#2196F3')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5');
        }

        // Draw vertex points
        allPoints.forEach((v, i) => {
            const p = this.coordSystem.toPixel(v.x, v.y);
            const isLast = i === allPoints.length - 1;
            const isFirst = i === 0;

            this.previewGroup.append('circle')
                .attr('cx', p.x)
                .attr('cy', p.y)
                .attr('r', isFirst ? 8 : 6)
                .attr('fill', isLast ? '#FF5722' : (isFirst ? '#4CAF50' : '#2196F3'))
                .attr('stroke', '#fff')
                .attr('stroke-width', 2);

            // Vertex number label
            if (!isLast) {
                this.previewGroup.append('text')
                    .attr('x', p.x + 10)
                    .attr('y', p.y - 10)
                    .attr('fill', '#333')
                    .attr('font-size', '11px')
                    .attr('font-weight', 'bold')
                    .text(i + 1);
            }
        });

        // Draw snap indicator for first vertex
        if (this.mode === 'polygon' && this.vertices.length >= 3) {
            const first = this.vertices[0];
            const dist = Math.sqrt(
                Math.pow(this.currentMousePos.x - first.x, 2) +
                Math.pow(this.currentMousePos.y - first.y, 2)
            );
            if (dist < this.snapDistance * 2) {
                const p = this.coordSystem.toPixel(first.x, first.y);
                this.previewGroup.append('circle')
                    .attr('cx', p.x)
                    .attr('cy', p.y)
                    .attr('r', 12)
                    .attr('fill', 'none')
                    .attr('stroke', '#4CAF50')
                    .attr('stroke-width', 3);

                // "Close" label
                this.previewGroup.append('text')
                    .attr('x', p.x + 15)
                    .attr('y', p.y)
                    .attr('fill', '#4CAF50')
                    .attr('font-size', '12px')
                    .attr('font-weight', 'bold')
                    .text('CLOSE');
            }
        }
    }

    clearPreview() {
        this.previewGroup.selectAll('*').remove();
    }

    complete() {
        if (this.vertices.length >= 3 || (this.mode === 'line' && this.vertices.length >= 2)) {
            const result = {
                mode: this.mode,
                vertices: [...this.vertices],
                options: this.options
            };
            this.stop();
            this.onComplete(result);
        }
    }

    cancel() {
        this.stop();
        this.onCancel();
    }

    isActive() {
        return this.active;
    }
}
