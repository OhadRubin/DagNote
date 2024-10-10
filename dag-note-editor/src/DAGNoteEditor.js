import React, { useState, useRef, useEffect, useMemo } from 'react';
import NodeMetadataEditor from './NodeMetadataEditor';
import './styles.css'; // Import the CSS file

const DAGNoteEditor = () => {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [draggedNode, setDraggedNode] = useState(null);
    const [edgeStart, setEdgeStart] = useState(null);
    const [edgePreview, setEdgePreview] = useState(null);
    const [editingNode, setEditingNode] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [history, setHistory] = useState([]);
    const [currentStateIndex, setCurrentStateIndex] = useState(-1);

    const svgRef = useRef(null);
    const gRef = useRef(null);

    const nodeRadius = 50; // Adjust this value based on your node size

    // Derive selectedNode from nodes and selectedNodeId
    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId),
        [nodes, selectedNodeId]
    );

    // Add a new state to track if the metadata editor is focused
    const [isMetadataEditorFocused, setIsMetadataEditorFocused] = useState(false);

    // Utility functions (unchanged)
    const isPointInsideNode = (point, node) => {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        return Math.sqrt(dx * dx + dy * dy) <= nodeRadius;
    };

    const getTransformedPoint = (event) => {
        const svg = svgRef.current;
        const g = gRef.current;
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformedPoint = point.matrixTransform(g.getScreenCTM().inverse());
        return {
            x: transformedPoint.x,
            y: transformedPoint.y
        };
    };

    const getNodeAtPoint = (x, y) => {
        return nodes.find(node => isPointInsideNode({ x, y }, node));
    };

    const handleNodeTextChange = (event, nodeId) => {
        const newText = event.target.value;
        setNodes(prevNodes =>
            prevNodes.map(node =>
                node.id === nodeId ? {...node, text: newText } : node
            )
        );
    };

    // Update the handleMouseDown function
    const handleMouseDown = (event) => {
        const point = getTransformedPoint(event);
        const clickedNode = getNodeAtPoint(point.x, point.y);

        if (event.button === 0) { // Left mouse button
            if (clickedNode) {
                if (isShiftPressed) {
                    // Start edge creation
                    setEdgeStart(clickedNode);
                    setEdgePreview({ start: clickedNode, end: point });
                } else {
                    // Start dragging
                    setIsDragging(true);
                    setDraggedNode(clickedNode);
                    // Select the node
                    setSelectedNodeId(clickedNode.id);
                }
            } else {
                // Start panning
                setIsPanning(true);
                setPanStart({ x: event.clientX, y: event.clientY });
                // Deselect any selected node
                setSelectedNodeId(null);
            }
        }
    };

    // Update the handleMouseMove function (unchanged)
    const handleMouseMove = (event) => {
        const point = getTransformedPoint(event);

        if (isPanning) {
            const dx = event.clientX - panStart.x;
            const dy = event.clientY - panStart.y;
            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanStart({ x: event.clientX, y: event.clientY });
        } else if (isDragging && draggedNode) {
            setNodes(prevNodes => prevNodes.map(n =>
                n.id === draggedNode.id ? { ...n, x: point.x, y: point.y } : n
            ));
        } else if (edgeStart) {
            setEdgePreview({ start: edgeStart, end: point });
        }
    };

    // Update the handleMouseUp function (unchanged)
    const handleMouseUp = (event) => {
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
            // Save the current state after dragging
            saveState(nodes, edges);
        }

        setIsPanning(false);
    };

    const handleDoubleClick = (event) => {
        const point = getTransformedPoint(event);
        const clickedNode = getNodeAtPoint(point.x, point.y);
        if (clickedNode) {
            console.log("Edit node:", clickedNode.id);
            setEditingNode(clickedNode);
        } else {
            createNode(point.x, point.y);
        }
    };

    // Key event handlers (unchanged)
    const handleKeyDown = (event) => {
        if (event.key === 'Shift') {
            setIsShiftPressed(true);
        } else if (event.key === 'Backspace' && selectedNodeId && !isMetadataEditorFocused && !editingNode) {
            deleteSelectedNode();
        } else if (event.ctrlKey && event.key === 'z') {
            undo();
        }
    };

    const handleKeyUp = (event) => {
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
    }, [selectedNodeId, isMetadataEditorFocused]); // Add selectedNodeId and isMetadataEditorFocused to the dependency array

    // Functions for saving state, undo, createNode, deleteSelectedNode, createEdge (unchanged)
    const saveState = (updatedNodes, updatedEdges) => {
        setHistory(prevHistory => {
            const newHistory = [
                ...prevHistory.slice(0, currentStateIndex + 1),
                { nodes: [...updatedNodes], edges: [...updatedEdges] }
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

    const createNode = (x, y) => {
        const newNode = {
            id: `node-${Date.now()}`,
            x,
            y,
            text: '',
            metadata: {} // Initialize metadata field
        };
        setNodes(prevNodes => {
            const updatedNodes = [...prevNodes, newNode];
            saveState(updatedNodes, edges); // Use current edges
            return updatedNodes;
        });
        setSelectedNodeId(newNode.id);
    };

    const deleteSelectedNode = () => {
        let updatedEdges = [];
        setNodes(prevNodes => {
            const updatedNodes = prevNodes.filter(node => node.id !== selectedNodeId);
            setEdges(prevEdges => {
                updatedEdges = prevEdges.filter(edge =>
                    edge.fromNodeId !== selectedNodeId && edge.toNodeId !== selectedNodeId
                );
                saveState(updatedNodes, updatedEdges);
                return updatedEdges;
            });
            return updatedNodes;
        });
        setSelectedNodeId(null);
    };

    const createEdge = (fromNodeId, toNodeId) => {
        if (!edgeExists(fromNodeId, toNodeId)) {
            const newEdge = {
                id: `edge-${Date.now()}`,
                fromNodeId,
                toNodeId,
            };
            setEdges(prevEdges => {
                const updatedEdges = [...prevEdges, newEdge];
                saveState(nodes, updatedEdges); // Use current nodes
                return updatedEdges;
            });
        }
    };

    const edgeExists = (fromNodeId, toNodeId) => {
        return edges.some(edge =>
            (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId) ||
            (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
        );
    };

    // Function to handle metadata update
    const handleMetadataUpdate = (updatedMetadata) => {
        setNodes((prevNodes) => {
            const updatedNodes = prevNodes.map((node) =>
                node.id === selectedNodeId
                    ? { ...node, metadata: updatedMetadata }
                    : node
            );
            saveState(updatedNodes, edges);
            return updatedNodes;
        });
    };

    // Add functions to handle metadata editor focus
    const handleMetadataEditorFocus = () => {
        setIsMetadataEditorFocused(true);
    };

    const handleMetadataEditorBlur = () => {
        setIsMetadataEditorFocused(false);
    };

    // Function to calculate edge intersections (unchanged)
    const calculateIntersection = (fromNode, toNode) => {
        const nodeWidth = 100;  // Width of the node rectangle
        const nodeHeight = 60;  // Height of the node rectangle

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        const angle = Math.atan2(dy, dx);

        // Calculate the point where the line intersects the rectangle
        let intersectionX, intersectionY;

        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
            // Intersects with left or right side
            intersectionX = Math.sign(dx) * (nodeWidth / 2);
            intersectionY = dy * (intersectionX / dx);
        } else {
            // Intersects with top or bottom side
            intersectionY = Math.sign(dy) * (nodeHeight / 2);
            intersectionX = dx * (intersectionY / dy);
        }

        return {
            x: fromNode.x + intersectionX,
            y: fromNode.y + intersectionY
        };
    };

    // Update the renderEdge function
    const renderEdge = (edge) => {
        const fromNode = nodes.find(node => node.id === edge.fromNodeId);
        const toNode = nodes.find(node => node.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;

        const startPoint = calculateIntersection(fromNode, toNode);
        const endPoint = calculateIntersection(toNode, fromNode);

        // Calculate the midpoint of the edge
        const midX = (startPoint.x + endPoint.x) / 2;
        const midY = (startPoint.y + endPoint.y) / 2;

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
                <circle
                    cx={midX}
                    cy={midY}
                    r="3"
                    fill="black"
                />
            </g>
        );
    };

    // Update the renderNode function
    const renderNode = (node) => (
        <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            style={{ cursor: 'pointer' }}
        >
            <rect
                x="-50"
                y="-30"
                width="100"
                height="60"
                fill={selectedNodeId === node.id ? "lightblue" : "white"}
                stroke="black"
                strokeWidth="2"
                rx="5"
                ry="5"
            />
            {
                editingNode && editingNode.id === node.id ? (
                    <foreignObject x="-45" y="-25" width="90" height="50">
                        <input
                            type="text"
                            value={node.text}
                            onChange={(e) => handleNodeTextChange(e, node.id)}
                            onBlur={() => {
                                setEditingNode(null);
                                saveState(nodes, edges); // Save state after editing node text
                            }}
                            autoFocus
                            style={{
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                background: 'transparent',
                                textAlign: 'center',
                                fontSize: '14px',
                            }}
                        />
                    </foreignObject>
                ) : (
                    <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="14"
                        pointerEvents="none"
                    >
                        {node.text}
                    </text>
                )
            }
        </g>
    );

    // Save initial state on component mount
    useEffect(() => {
        saveState(nodes, edges);
    }, []);

    // Serialize the current state to JSON
    const serializeState = () => {
        const state = {
            nodes: nodes,
            edges: edges,
            panOffset: panOffset
        };
        return JSON.stringify(state);
    };

    // Deserialize JSON into application state
    const deserializeState = (json) => {
        try {
            const state = JSON.parse(json);
            setNodes(state.nodes);
            setEdges(state.edges);
            setPanOffset(state.panOffset);
            // Reset other state variables
            setSelectedNodeId(null);
            setEditingNode(null);
            setIsDragging(false);
            setEdgeStart(null);
            setEdgePreview(null);
            // Save the loaded state to history
            saveState(state.nodes, state.edges);
        } catch (error) {
            console.error("Error deserializing state:", error);
        }
    };

    // Add these new functions to handle saving and loading

    const handleSave = () => {
        const serializedState = serializeState();
        localStorage.setItem('dagNoteEditorState', serializedState);
        alert('State saved successfully!');
    };

    const handleLoad = () => {
        const savedState = localStorage.getItem('dagNoteEditorState');
        if (savedState) {
            deserializeState(savedState);
            alert('State loaded successfully!');
        } else {
            alert('No saved state found.');
        }
    };

    // {{ add_export_function }}
    const exportToDot = () => {
        let dot = 'digraph G {\n';
        nodes.forEach(node => {
            dot += `  "${node.id}" [label="${node.text}"];\n`;
        });
        edges.forEach(edge => {
            dot += `  "${edge.fromNodeId}" -> "${edge.toNodeId}";\n`;
        });
        dot += '}';

        const blob = new Blob([dot], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'graph.dot';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="editor-container">
            <div className="toolbar">
                <button onClick={handleSave}>Save</button>
                <button onClick={handleLoad}>Load</button>
                <button onClick={exportToDot}>Export to DOT</button>
            </div>
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
                    tabIndex="0"
                >
                    <g ref={gRef} transform={`translate(${panOffset.x}, ${panOffset.y})`}>
                        <defs>
                            <marker
                                id="arrowhead"
                                markerWidth="10"
                                markerHeight="7"
                                refX="9"
                                refY="3.5"
                                orient="auto"
                            >
                                <polygon points="0 0, 10 3.5, 0 7" fill="black" />
                            </marker>
                        </defs>
                        {edges.map(renderEdge)}
                        {nodes.map(renderNode)}
                        {
                            edgePreview && (
                                <line
                                    x1={edgePreview.start.x}
                                    y1={edgePreview.start.y}
                                    x2={edgePreview.end.x}
                                    y2={edgePreview.end.y}
                                    stroke="black"
                                    strokeWidth="2"
                                    strokeDasharray="5,5"
                                />
                            )
                        }
                    </g>
                </svg>
            </div>
            {selectedNode && (
                <div className="metadata-editor-container">
                    <NodeMetadataEditor
                        node={selectedNode}
                        onUpdate={handleMetadataUpdate}
                        onFocus={handleMetadataEditorFocus}
                        onBlur={handleMetadataEditorBlur}
                    />
                </div>
            )}
        </div>
    );
};

export default DAGNoteEditor;