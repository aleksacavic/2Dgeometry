// Blender Bridge Component
// WebSocket client for communicating with Blender

export class BlenderBridge {
    constructor(config = {}) {
        this.host = config.host || 'localhost';
        this.port = config.port || 8765;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
        this.reconnectDelay = config.reconnectDelay || 2000;

        // Callbacks
        this.onConnect = config.onConnect || (() => {});
        this.onDisconnect = config.onDisconnect || (() => {});
        this.onError = config.onError || (() => {});
        this.onCrossSection = config.onCrossSection || (() => {});
        this.onObjectList = config.onObjectList || (() => {});
        this.onMessage = config.onMessage || (() => {});

        // Pending requests
        this.pendingRequests = new Map();
        this.requestId = 0;
    }

    getUrl() {
        return `ws://${this.host}:${this.port}`;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('Already connected to Blender');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.getUrl());

                this.ws.onopen = () => {
                    console.log('Connected to Blender');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.onConnect();
                    resolve();
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from Blender');
                    this.connected = false;
                    this.onDisconnect();

                    // Attempt reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
                        setTimeout(() => this.connect(), this.reconnectDelay);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.onError(error);
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect() {
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            this.onMessage(message);

            // Handle specific message types
            if (message.type === 'cross_section_update') {
                this.onCrossSection(message);
            }

            // Handle response to request
            if (message.requestId && this.pendingRequests.has(message.requestId)) {
                const { resolve } = this.pendingRequests.get(message.requestId);
                this.pendingRequests.delete(message.requestId);
                resolve(message);
            }

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    send(data) {
        if (!this.connected || !this.ws) {
            console.warn('Not connected to Blender');
            return Promise.reject(new Error('Not connected'));
        }

        return new Promise((resolve, reject) => {
            const requestId = ++this.requestId;
            data.requestId = requestId;

            this.pendingRequests.set(requestId, { resolve, reject });

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, 10000);

            this.ws.send(JSON.stringify(data));
        });
    }

    // API Methods

    async ping() {
        return this.send({ action: 'ping' });
    }

    async getObjects() {
        const response = await this.send({ action: 'get_objects' });
        if (response.objects) {
            this.onObjectList(response.objects);
        }
        return response;
    }

    async getCrossSection(objectName, planeY = 0, planeNormal = 'Y') {
        const response = await this.send({
            action: 'get_cross_section',
            object: objectName,
            plane_y: planeY,
            plane_normal: planeNormal
        });

        if (response.polygons) {
            this.onCrossSection(response);
        }

        return response;
    }

    async getVolume(objectName) {
        return this.send({
            action: 'get_volume',
            object: objectName
        });
    }

    async getBounds(objectName) {
        return this.send({
            action: 'get_bounds',
            object: objectName
        });
    }

    async getSelected() {
        const response = await this.send({ action: 'get_selected' });
        if (response.cross_section) {
            this.onCrossSection(response);
        }
        return response;
    }

    async updateVertices(objectName, vertices) {
        return this.send({
            action: 'update_vertices',
            object: objectName,
            vertices: vertices
        });
    }

    isConnected() {
        return this.connected;
    }
}


// Blender Cross-Section Element
// Renders cross-section data from Blender as an editable element

export class BlenderCrossSection {
    constructor(coordSystem, layer, config = {}) {
        this.coordSystem = coordSystem;
        this.layer = layer;
        this.id = config.id || `blender-${Date.now()}`;

        this.params = {
            objectName: config.objectName || 'Unknown',
            polygons: config.polygons || [],
            volume: config.volume || 0,
            bounds: config.bounds || null,
            cutPosition: config.cutPosition || 0,
            fillColor: config.fillColor || '#607D8B',
            strokeColor: config.strokeColor || '#37474F',
            fillOpacity: config.fillOpacity || 0.7,
            offsetX: config.offsetX || 0,
            offsetY: config.offsetY || 0,
            scale: config.scale || 1,
        };

        this.selected = false;
        this.group = null;

        this.onSelect = config.onSelect || (() => {});
        this.onUpdate = config.onUpdate || (() => {});

        if (this.params.polygons.length > 0) {
            this.render();
        }
    }

    render() {
        if (this.group) {
            this.group.remove();
        }

        this.group = this.layer.append('g')
            .attr('class', 'blender-cross-section')
            .attr('data-id', this.id);

        // Render each polygon
        this.params.polygons.forEach((polygon, index) => {
            if (polygon.length < 3) return;

            const pathData = this.buildPath(polygon);

            this.group.append('path')
                .attr('class', 'blender-fill')
                .attr('d', pathData)
                .attr('fill', this.params.fillColor)
                .attr('fill-opacity', this.params.fillOpacity)
                .attr('stroke', this.params.strokeColor)
                .attr('stroke-width', 2)
                .style('cursor', 'pointer');
        });

        // Add label
        if (this.params.polygons.length > 0 && this.params.polygons[0].length > 0) {
            const firstPoint = this.params.polygons[0][0];
            const pixel = this.coordSystem.toPixel(
                firstPoint.x * this.params.scale + this.params.offsetX,
                firstPoint.y * this.params.scale + this.params.offsetY
            );

            this.group.append('text')
                .attr('class', 'blender-label')
                .attr('x', pixel.x)
                .attr('y', pixel.y - 10)
                .attr('fill', '#333')
                .attr('font-size', '11px')
                .attr('font-weight', 'bold')
                .text(`Blender: ${this.params.objectName}`);
        }

        // Click handler
        this.group.on('click', (event) => {
            event.stopPropagation();
            this.onSelect(this);
        });

        this.updateSelection();
    }

    buildPath(polygon) {
        if (polygon.length === 0) return '';

        const pixels = polygon.map(v =>
            this.coordSystem.toPixel(
                v.x * this.params.scale + this.params.offsetX,
                v.y * this.params.scale + this.params.offsetY
            )
        );

        let d = `M ${pixels[0].x} ${pixels[0].y}`;
        for (let i = 1; i < pixels.length; i++) {
            d += ` L ${pixels[i].x} ${pixels[i].y}`;
        }
        d += ' Z';

        return d;
    }

    setPolygons(polygons) {
        this.params.polygons = polygons;
        this.render();
    }

    updateFromBlender(data) {
        if (data.polygons) {
            this.params.polygons = data.polygons;
        }
        if (data.object) {
            this.params.objectName = data.object;
        }
        if (data.volume !== undefined) {
            this.params.volume = data.volume;
        }
        if (data.bounds) {
            this.params.bounds = data.bounds;
        }
        if (data.cut_position !== undefined) {
            this.params.cutPosition = data.cut_position;
        }

        this.render();
        this.onUpdate();
    }

    setSelected(selected) {
        this.selected = selected;
        this.updateSelection();
    }

    updateSelection() {
        if (this.group) {
            this.group.classed('selected', this.selected);
            this.group.selectAll('.blender-fill')
                .attr('stroke', this.selected ? '#2196F3' : this.params.strokeColor)
                .attr('stroke-width', this.selected ? 3 : 2);
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

    getBackFace() {
        // Find rightmost points for soil attachment
        if (this.params.polygons.length === 0) {
            return { bottom: { x: 0, y: 0 }, top: { x: 0, y: 1 } };
        }

        const allPoints = this.params.polygons.flat();
        if (allPoints.length === 0) {
            return { bottom: { x: 0, y: 0 }, top: { x: 0, y: 1 } };
        }

        const maxX = Math.max(...allPoints.map(p => p.x * this.params.scale + this.params.offsetX));
        const rightPoints = allPoints.filter(p =>
            Math.abs((p.x * this.params.scale + this.params.offsetX) - maxX) < 0.01
        );

        if (rightPoints.length >= 2) {
            rightPoints.sort((a, b) => a.y - b.y);
            return {
                bottom: {
                    x: rightPoints[0].x * this.params.scale + this.params.offsetX,
                    y: rightPoints[0].y * this.params.scale + this.params.offsetY
                },
                top: {
                    x: rightPoints[rightPoints.length - 1].x * this.params.scale + this.params.offsetX,
                    y: rightPoints[rightPoints.length - 1].y * this.params.scale + this.params.offsetY
                }
            };
        }

        const minY = Math.min(...allPoints.map(p => p.y * this.params.scale + this.params.offsetY));
        const maxY = Math.max(...allPoints.map(p => p.y * this.params.scale + this.params.offsetY));

        return {
            bottom: { x: maxX, y: minY },
            top: { x: maxX, y: maxY }
        };
    }

    getBounds() {
        const allPoints = this.params.polygons.flat();
        if (allPoints.length === 0) {
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        }

        return {
            minX: Math.min(...allPoints.map(p => p.x * this.params.scale + this.params.offsetX)),
            maxX: Math.max(...allPoints.map(p => p.x * this.params.scale + this.params.offsetX)),
            minY: Math.min(...allPoints.map(p => p.y * this.params.scale + this.params.offsetY)),
            maxY: Math.max(...allPoints.map(p => p.y * this.params.scale + this.params.offsetY)),
        };
    }

    destroy() {
        if (this.group) {
            this.group.remove();
        }
    }
}
