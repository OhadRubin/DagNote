import React, { useState, useRef, useEffect, useMemo } from 'react';
import './styles.css';
import PropTypes from 'prop-types';

// Define types for your data structures
interface Node {
    id: string;
    x: number;
    y: number;
    label: string;
    metadata: Record<string, any>;
}

interface Port {
    id: string;
    label: string;
    metadata: Record<string, any>;
}

interface Edge {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromPort: Port;
    toPort: Port;
}

// Define props for your components
interface NodeMetadataEditorProps {
    node: Node;
    onUpdate: (metadata: Record<string, any>) => void;
    onFocus: () => void;
    onBlur: () => void;
    edges: Edge[];
    onPortLabelChange: (nodeId: string, portId: string, newLabel: string) => void;
    onLabelChange: (nodeId: string, newLabel: string) => void;
}

interface PortCircleProps {
    x: number;
    y: number;
    port: Port;
    nodeId: string;
    color: string;
    onLabelChange: (nodeId: string, portId: string, newLabel: string) => void;
    onSelectPort: (port: Port) => void;
    isSelected: boolean;
}

// Declare the vscode API
declare const acquireVsCodeApi: () => {
    postMessage: (message: any) => void;
};

const vscode = acquireVsCodeApi();

const DAGNoteEditor: React.FC = () => {
    const nodeRadius = 50;

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [draggedNode, setDraggedNode] = useState<Node | null>(null);
    const [edgeStart, setEdgeStart] = useState<Node | null>(null);
    const [edgePreview, setEdgePreview] = useState<{ start: Node; end: { x: number; y: number } } | null>(null);
    const [editingNode, setEditingNode] = useState<Node | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
    const [currentStateIndex, setCurrentStateIndex] = useState(-1);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [metadataEditorWidth, setMetadataEditorWidth] = useState(300);
    const [selectedPort, setSelectedPort] = useState<Port | null>(null);
    const [isMetadataEditorFocused, setIsMetadataEditorFocused] = useState(false);

    const mainContentRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);

    const handleSaveToFile = () => {
        const serializedState = serializeState();
        vscode.postMessage({
            command: 'saveToFile',
            data: serializedState
        });
    };

    const handleLoadFromFile = () => {
        vscode.postMessage({
            command: 'loadFromFile'
        });
    };

    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                case 'loadState':
                    deserializeState(message.state);
                    break;
                // ... handle other commands if needed ...
            }
        };

        window.addEventListener('message', messageHandler);

        return () => {
            window.removeEventListener('message', messageHandler);
        };
    }, []);

    const isPointInsideNode = (point: { x: number; y: number }, node: Node): boolean => {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        return Math.sqrt(dx * dx + dy * dy) <= nodeRadius;
    };

    const getTransformedPoint = (event: React.MouseEvent): { x: number; y: number } => {
        const svg = svgRef.current;
        const g = gRef.current;
        if (!svg || !g) return { x: 0, y: 0 };
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformedPoint = point.matrixTransform(g.getScreenCTM()?.inverse());
        return {
            x: transformedPoint.x,
            y: transformedPoint.y
        };
    };

    const getNodeAtPoint = (x: number, y: number): Node | undefined => {
        return nodes.find(node => isPointInsideNode({ x, y }, node));
    };

    const handleMouseDown = (event: React.MouseEvent) => {
        if (event.target instanceof Element && event.target.closest('.metadata-editor-container')) {
            return;
        }

        const point = getTransformedPoint(event);
        const clickedNode = getNodeAtPoint(point.x, point.y);

        if (event.button === 0) {
            if (clickedNode) {
                if (isShiftPressed) {
                    setEdgeStart(clickedNode);
                    setEdgePreview({ start: clickedNode, end: point });
                } else {
                    setIsDragging(true);
                    setDraggedNode(clickedNode);
                    setSelectedNodeId(clickedNode.id);
                }
            } else {
                setIsPanning(true);
                setPanStart({ x: event.clientX, y: event.clientY });
                setSelectedNodeId(null);
            }
        }

        setSelectedPort(null);
    };

    const handleMouseMove = (event: React.MouseEvent) => {
        const point = getTransformedPoint(event);

        if (isPanning) {
            const dx = event.clientX - panStart.x;
            const dy = event.clientY - panStart.y;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanStart({ x: event.clientX, y: event.clientY });
        } else if (isDragging && draggedNode) {
            setNodes(prevNodes => prevNodes.map(n =>
                n.id === draggedNode.id ? {...n, x: point.x, y: point.y } : n
            ));
        } else if (edgeStart) {
            setEdgePreview({ start: edgeStart, end: point });
        }
    };

    const handleMouseUp = (event: React.MouseEvent) => {
        const point = getTransformedPoint(event);

        if (edgeStart) {
            const endNode = getNodeAtPoint(point.x, point.y);

            if (endNode && endNode.id !== edgeStart.id) {
                createEdge(edgeStart.id, endNode.id);
            }

            setEdgeStart(null);
            setEdgePreview(null);
        }

        if (isDragging) {
            setIsDragging(false);
            setDraggedNode(null);
            saveState();
        }

        setIsPanning(false);
    };

    const handleDoubleClick = (event: React.MouseEvent) => {
        const point = getTransformedPoint(event);
        const clickedNode = getNodeAtPoint(point.x, point.y);
        if (clickedNode) {
            setEditingNode(clickedNode);
        } else {
            createNode(point.x, point.y);
        }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
            setIsShiftPressed(true);
        } else if (event.key === 'Backspace' && selectedNodeId) {
            deleteSelectedNode();
        } else if (event.ctrlKey && event.key === 'z') {
            undo();
        }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Shift') {
            setIsShiftPressed(false);
        }
    };

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [selectedNodeId, isMetadataEditorFocused]);

    const saveState = () => {
        setHistory(prevHistory => {
            const newHistory = [
                ...prevHistory.slice(0, currentStateIndex + 1),
                { nodes: [...nodes], edges: [...edges] }
            ];
            return newHistory;
        });
        setCurrentStateIndex(prevIndex => prevIndex + 1);
    };

    const undo = () => {
        setCurrentStateIndex(prevIndex => {
            const newIndex = Math.max(prevIndex - 1, 0);
            if (newIndex !== prevIndex && history[newIndex]) {
                setNodes(history[newIndex].nodes);
                setEdges(history[newIndex].edges);
            }
            return newIndex;
        });
    };

    const createNode = (x: number, y: number) => {
        const newNode: Node = {
            id: `node-${Date.now()}`,
            x,
            y,
            label: 'New Node',
            metadata: {}
        };
        setNodes(prevNodes => {
            const updatedNodes = [...prevNodes, newNode];
            saveState();
            return updatedNodes;
        });
        setSelectedNodeId(newNode.id);
    };

    const deleteSelectedNode = () => {
        if (isMetadataEditorFocused || editingNode) {
            return;
        }
        setNodes(prevNodes => {
            const updatedNodes = prevNodes.filter(node => node.id !== selectedNodeId);
            setEdges(prevEdges => {
                const updatedEdges = prevEdges.filter(edge =>
                    edge.fromNodeId !== selectedNodeId && edge.toNodeId !== selectedNodeId
                );
                saveState();
                return updatedEdges;
            });
            return updatedNodes;
        });
        setSelectedNodeId(null);
    };

    const createEdge = (fromNodeId: string, toNodeId: string) => {
        if (!edgeExists(fromNodeId, toNodeId)) {
            const newEdge: Edge = {
                id: `edge-${Date.now()}`,
                fromNodeId,
                toNodeId,
                fromPort: { id: `port-${Date.now()}-from`, label: 'Output', metadata: {} },
                toPort: { id: `port-${Date.now()}-to`, label: 'Input', metadata: {} }
            };
            setEdges(prevEdges => {
                const updatedEdges = [...prevEdges, newEdge];
                saveState();
                return updatedEdges;
            });
        }
    };

    const edgeExists = (fromNodeId: string, toNodeId: string) => {
        return edges.some(edge =>
            (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId) ||
            (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
        );
    };

    const handleMetadataUpdate = (updatedMetadata: Record<string, any>) => {
        const nodeId = selectedNodeId || focusedNodeId;
        if (!nodeId) return;
        setNodes((prevNodes) => {
            const updatedNodes = prevNodes.map((node) =>
                node.id === nodeId ?
                { ...node, metadata: updatedMetadata } :
                node
            );
            saveState();
            return updatedNodes;
        });
    };

    const handleMetadataEditorFocus = (nodeId: string) => {
        setIsMetadataEditorFocused(true);
        setFocusedNodeId(nodeId);
    };

    const handleMetadataEditorBlur = () => {
        setIsMetadataEditorFocused(false);
        setFocusedNodeId(null);
    };

    const calculateIntersection = (fromNode: Node, toNode: Node) => {
        const nodeWidth = 100;
        const nodeHeight = 60;

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        const angle = Math.atan2(dy, dx);

        let intersectionX, intersectionY;

        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
            intersectionX = Math.sign(dx) * (nodeWidth / 2);
            intersectionY = dy * (intersectionX / dx);
        } else {
            intersectionY = Math.sign(dy) * (nodeHeight / 2);
            intersectionX = dx * (intersectionY / dy);
        }

        return {
            x: fromNode.x + intersectionX,
            y: fromNode.y + intersectionY
        };
    };

    const renderEdge = (edge: Edge) => {
        const fromNode = nodes.find(node => node.id === edge.fromNodeId);
        const toNode = nodes.find(node => node.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;

        const startPoint = calculateIntersection(fromNode, toNode);
        const endPoint = calculateIntersection(toNode, fromNode);

        const oneThirdPoint = {
            x: startPoint.x + (endPoint.x - startPoint.x) / 3,
            y: startPoint.y + (endPoint.y - startPoint.y) / 3,
        };
        const twoThirdsPoint = {
            x: startPoint.x + 2 * (endPoint.x - startPoint.x) / 3,
            y: startPoint.y + 2 * (endPoint.y - startPoint.y) / 3,
        };

        return (
            <g key={edge.id}>
                <line
                    x1={startPoint.x}
                    y1={startPoint.y}
                    x2={endPoint.x}
                    y2={endPoint.y}
                    stroke="black"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                />
                <PortCircle
                    x={oneThirdPoint.x}
                    y={oneThirdPoint.y}
                    port={edge.fromPort}
                    nodeId={edge.fromNodeId}
                    color="green"
                    onLabelChange={handlePortLabelChange}
                    onSelectPort={setSelectedPort}
                    isSelected={selectedPort?.id === edge.fromPort.id}
                />
                <PortCircle
                    x={twoThirdsPoint.x}
                    y={twoThirdsPoint.y}
                    port={edge.toPort}
                    nodeId={edge.toNodeId}
                    color="blue"
                    onLabelChange={handlePortLabelChange}
                    onSelectPort={setSelectedPort}
                    isSelected={selectedPort?.id === edge.toPort.id}
                />
            </g>
        );
    };

    const renderNode = (node: Node) => {
        const fontSize = 14;
        const padding = 10;
        const approximateCharWidth = fontSize * 0.6;
        const textWidth = node.label.length * approximateCharWidth;

        const rectWidth = textWidth + padding * 2;
        const rectHeight = fontSize + padding * 2;

        return (
            <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                style={{ cursor: 'pointer' }}
            >
                <rect
                    x={-rectWidth / 2}
                    y={-rectHeight / 2}
                    width={rectWidth}
                    height={rectHeight}
                    fill={selectedNodeId === node.id ? "lightblue" : "white"}
                    stroke="black"
                    strokeWidth="2"
                    rx="5"
                    ry="5"
                />
                {editingNode && editingNode.id === node.id ? (
                    <foreignObject
                        x={-rectWidth / 2 + padding}
                        y={-rectHeight / 2 + padding}
                        width={rectWidth - padding * 2}
                        height={rectHeight - padding * 2}
                    >
                        <input
                            type="text"
                            value={node.label}
                            onChange={(e) => handleLabelChange(node.id, e.target.value)}
                            onBlur={() => {
                                setEditingNode(null);
                                saveState();
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            onFocus={() => setSelectedNodeId(null)}
                            autoFocus
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                background: 'transparent',
                                textAlign: 'center',
                                fontSize: `${fontSize}px`,
                            }}
                        />
                    </foreignObject>
                ) : (
                    <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={fontSize}
                        pointerEvents="none"
                    >
                        {node.label}
                    </text>
                )}
            </g>
        );
    };

    const handlePortLabelChange = (nodeId: string, portId: string, newLabel: string) => {
        setEdges(prevEdges => {
            const updatedEdges = prevEdges.map(edge => {
                if (edge.fromNodeId === nodeId && edge.fromPort.id === portId) {
                    return { ...edge, fromPort: { ...edge.fromPort, label: newLabel } };
                }
                if (edge.toNodeId === nodeId && edge.toPort.id === portId) {
                    return { ...edge, toPort: { ...edge.toPort, label: newLabel } };
                }
                return edge;
            });
            saveState();
            return updatedEdges;
        });
    };

    const handleLabelChange = (nodeId: string, newLabel: string) => {
        setNodes(prevNodes => {
            const updatedNodes = prevNodes.map(node =>
                node.id === nodeId ? {...node, label: newLabel} : node
            );
            saveState();
            return updatedNodes;
        });
    };

    const handleMouseDownOnResizer = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = metadataEditorWidth;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(200, Math.min(1000, startWidth + deltaX));
            setMetadataEditorWidth(newWidth);
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId),
        [nodes, selectedNodeId]
    );

    let nodeForEditor = selectedNode || nodes.find(node => node.id === focusedNodeId);

    if (!nodeForEditor && selectedPort) {
        const edgeContainingPort = edges.find(
            edge => edge.fromPort.id === selectedPort.id || edge.toPort.id === selectedPort.id
        );
        if (edgeContainingPort) {
            const nodeId = edgeContainingPort.fromPort.id === selectedPort.id
                ? edgeContainingPort.fromNodeId
                : edgeContainingPort.toNodeId;
            nodeForEditor = nodes.find(node => node.id === nodeId);
        }
    }

    const serializeState = (): string => {
        return JSON.stringify({ nodes, edges, panOffset });
    };

    const deserializeState = (state: string) => {
        try {
            const { nodes: loadedNodes, edges: loadedEdges, panOffset: loadedPanOffset } = JSON.parse(state);
            setNodes(loadedNodes);
            setEdges(loadedEdges);
            setPanOffset(loadedPanOffset);
        } catch (error) {
            console.error("Error deserializing state:", error);
        }
    };

    const exportToDot = () => {
        let dot = 'digraph G {\n';
        nodes.forEach(node => {
            dot += `  "${node.id}" [label="${node.label}"];\n`;
        });
        edges.forEach(edge => {
            dot += `  "${edge.fromNodeId}" -> "${edge.toNodeId}";\n`;
        });
        dot += '}';

        vscode.postMessage({
            command: 'exportToDot',
            data: dot
        });
    };

    return (
        <div className="editor-container">
            <div className="toolbar">
                <button onClick={handleSaveToFile}>Save to File</button>
                <button onClick={handleLoadFromFile}>Load from File</button>
                <button onClick={exportToDot}>Export to DOT</button>
            </div>
            <div className="main-content" ref={mainContentRef}>
                <div className="svg-container">
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onDoubleClick={handleDoubleClick}
                        style={{
                            cursor: isPanning
                                ? 'grabbing'
                                : isShiftPressed
                                ? 'crosshair'
                                : 'default',
                        }}
                    >
                        <g ref={gRef} transform={`translate(${panOffset.x}, ${panOffset.y})`}>
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="black" />
                                </marker>
                            </defs>
                            {edges.map(renderEdge)}
                            {nodes.map(renderNode)}
                            {edgePreview && (
                                <line
                                    x1={edgePreview.start.x}
                                    y1={edgePreview.start.y}
                                    x2={edgePreview.end.x}
                                    y2={edgePreview.end.y}
                                    stroke="black"
                                    strokeWidth="2"
                                    strokeDasharray="5,5"
                                />
                            )}
                        </g>
                    </svg>
                </div>
                {nodeForEditor && (
                    <>
                        <div
                            className="resizer"
                            onMouseDown={handleMouseDownOnResizer}
                        />
                        <div
                            className="metadata-editor-container"
                            style={{ width: `${metadataEditorWidth}px`}}
                        >
                            <NodeMetadataEditor
                                node={nodeForEditor}
                                onUpdate={handleMetadataUpdate}
                                onFocus={() => nodeForEditor && handleMetadataEditorFocus(nodeForEditor.id)}
                                onBlur={handleMetadataEditorBlur}
                                edges={edges}
                                onPortLabelChange={handlePortLabelChange}
                                onLabelChange={handleLabelChange}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const NodeMetadataEditor: React.FC<NodeMetadataEditorProps> = ({ node, onUpdate, onFocus, onBlur, edges, onPortLabelChange, onLabelChange }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        onUpdate({...node.metadata, [name]: value });
    };

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onLabelChange(node.id, e.target.value);
    };

    const connectedEdges = edges.filter(edge => edge.fromNodeId === node.id || edge.toNodeId === node.id);

    const handlePortLabelChange = (portId: string, newLabel: string) => {
        onPortLabelChange(node.id, portId, newLabel);
    };

    return (
        <div className="metadata-editor">
            <h3>Edit Node</h3>
            <label>
                <span>Label:</span>
                <input
                    name="label"
                    value={node.label || ''}
                    onChange={handleLabelChange}
                    onFocus={onFocus}
                    onBlur={onBlur}
                />
            </label>
            <br />
            <label>
                <span>Description:</span>
                <textarea
                    name="description"
                    value={node.metadata.description || ''}
                    onChange={handleChange}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    rows={4}
                    cols={50}
                />
            </label>
            <h4>Connected Ports</h4>
            {connectedEdges.map(edge => (
                <div key={edge.id}>
                    {edge.fromNodeId === node.id && (
                        <label>
                            <span>Output Port:</span>
                            <input
                                value={edge.fromPort.label}
                                onChange={(e) => handlePortLabelChange(edge.fromPort.id, e.target.value)}
                                onFocus={onFocus}
                                onBlur={onBlur}
                            />
                        </label>
                    )}
                    {edge.toNodeId === node.id && (
                        <label>
                            <span>Input Port:</span>
                            <input
                                value={edge.toPort.label}
                                onChange={(e) => handlePortLabelChange(edge.toPort.id, e.target.value)}
                                onFocus={onFocus}
                                onBlur={onBlur}
                            />
                        </label>
                    )}
                </div>
            ))}
        </div>
    );
};

const PortCircle: React.FC<PortCircleProps> = ({ x, y, port, nodeId, color, onLabelChange, onSelectPort, isSelected }) => {
    const [isEditing, setIsEditing] = useState(false);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelectPort(port);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        onSelectPort(port);
    };

    const handleBlur = () => {
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <g transform={`translate(${x}, ${y})`} onClick={handleClick}>
            <circle r="5" fill={color} />
            {isEditing ? (
                <foreignObject x="10" y="-10" width="100" height="20">
                    <input
                        type="text"
                        value={port.label}
                        onChange={(e) => onLabelChange(nodeId, port.id, e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            fontSize: '12px',
                        }}
                    />
                </foreignObject>
            ) : (
                <text
                    x="10"
                    y="5"
                    fontSize="12"
                    fill="black"
                    onDoubleClick={handleDoubleClick}
                    style={{
                        cursor: 'pointer',
                        stroke: isSelected ? 'blue' : 'none',
                        strokeWidth: isSelected ? 1 : 0,
                    }}
                >
                    {port.label}
                </text>
            )}
        </g>
    );
};

export default DAGNoteEditor;