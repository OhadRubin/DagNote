import React, { useState, useRef, useEffect } from 'react';
import { ArrowRightIcon } from 'lucide-react';

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

    const svgRef = useRef(null);
    const gRef = useRef(null);

    const nodeRadius = 50; // Adjust this value based on your node size

    // Update the isPointInsideNode function
    const isPointInsideNode = (point, node) => {
        const dx = point.x - (node.x);
        const dy = point.y - (node.y);
        return Math.sqrt(dx * dx + dy * dy) <= nodeRadius;
    };

    // Update the handleMouseDown function
    const handleMouseDown = (event) => {
        const point = getTransformedPoint(event);
        const clickedNode = getNodeAtPoint(point.x, point.y);

        if (event.button === 0) { // Left mouse button
            if (isShiftPressed) {
                if (clickedNode) {
                    setEdgeStart(clickedNode);
                    setEdgePreview({ start: clickedNode, end: point });
                }
            } else if (clickedNode) {
                setIsDragging(true);
                setDraggedNode(clickedNode);
            } else {
                setIsPanning(true);
                setPanStart({ x: event.clientX, y: event.clientY });
            }
        }
    };

    // Update the handleMouseMove function
    const handleMouseMove = (event) => {
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

    // Update the handleMouseUp function
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

        setIsPanning(false);
        setIsDragging(false);
        setDraggedNode(null);
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

    const handleKeyDown = (event) => {
        if (event.key === 'Shift') {
            console.log("Shift pressed");
            setIsShiftPressed(true);
        }
    };

    const handleKeyUp = (event) => {
        if (event.key === 'Shift') {
            console.log("Shift released");
            setIsShiftPressed(false);
        }
    };

    const createNode = (x, y) => {
        const newNode = {
            id: `node-${Date.now()}`,
            x,
            y,
            text: 'New Node',
        };
        console.log("Creating node:", newNode);
        setNodes(prevNodes => [...prevNodes, newNode]);
    };

    const createEdge = (fromNodeId, toNodeId) => {
        if (!edgeExists(fromNodeId, toNodeId)) {
            const newEdge = {
                id: `edge-${Date.now()}`,
                fromNodeId,
                toNodeId,
            };
            console.log("Creating edge:", newEdge);
            setEdges(prevEdges => [...prevEdges, newEdge]);
        }
    };

    const edgeExists = (fromNodeId, toNodeId) => {
        return edges.some(edge =>
            (edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId) ||
            (edge.fromNodeId === toNodeId && edge.toNodeId === fromNodeId)
        );
    };

    // Update the getTransformedPoint function
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

    // Update the getNodeAtPoint function
    const getNodeAtPoint = (x, y) => {
        return nodes.find(node => isPointInsideNode({x, y}, node));
    };

    const handleNodeTextChange = (event, nodeId) => {
        const newText = event.target.value;
        setNodes(prevNodes =>
            prevNodes.map(node =>
                node.id === nodeId ? {...node, text: newText } : node
            )
        );
    };

    // Update the renderEdge function
    const renderEdge = (edge) => {
        const fromNode = nodes.find(node => node.id === edge.fromNodeId);
        const toNode = nodes.find(node => node.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;

        return (
            <line
                key={edge.id}
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke="black"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
            />
        );
    };

    // Update the renderNode function
    const renderNode = (node) => (
        <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
        >
            <rect
                x="-50"
                y="-30"
                width="100"
                height="60"
                fill="white"
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
                            onBlur={() => setEditingNode(null)}
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

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return (
        <svg
            ref={svgRef}
            width="100%"
            height="1000px"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            style={{ cursor: isPanning ? 'grabbing' : (isShiftPressed ? 'crosshair' : 'default') }}
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
    );
};

export default DAGNoteEditor;