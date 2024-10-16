import React, { useState, useRef, useEffect, useMemo } from 'react';
import './styles.css'; // Import the CSS file
import PropTypes from 'prop-types';

const NodeMetadataEditor = ({ node, onUpdate, onFocus, onBlur, edges, onPortLabelChange, onLabelChange }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({...node.metadata, [name]: value });
    };

    const handleLabelChange = (e) => {
        onLabelChange(node.id, e.target.value);
    };

    const connectedEdges = edges.filter(edge => edge.fromNodeId === node.id || edge.toNodeId === node.id);

    const handlePortLabelChange = (portId, newLabel) => {
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
                    rows="4"
                    cols="50"
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

NodeMetadataEditor.propTypes = {
    node: PropTypes.object.isRequired,
    onUpdate: PropTypes.func.isRequired,
    onFocus: PropTypes.func.isRequired,
    onBlur: PropTypes.func.isRequired,
    edges: PropTypes.array.isRequired,
    onPortLabelChange: PropTypes.func.isRequired,
    onLabelChange: PropTypes.func.isRequired,
};

const PortCircle = ({ x, y, port, nodeId, color, onLabelChange, onSelectPort, isSelected }) => {
    const [isEditing, setIsEditing] = useState(false);

    const handleClick = (e) => {
        e.stopPropagation();
        onSelectPort(port); // Set the selected port
    };

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        setIsEditing(true);
        onSelectPort(port); // Also select the port on double-click
    };

    const handleBlur = () => {
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur(); // This will trigger the onBlur event
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
                        stroke: isSelected ? 'blue' : 'none', // Highlight border if selected
                        strokeWidth: isSelected ? 1 : 0,
                    }}
                >
                    {port.label}
                </text>
            )}
        </g>
    );
};

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
    const [focusedNodeId, setFocusedNodeId] = useState(null);
    const [metadataEditorWidth, setMetadataEditorWidth] = useState(300); // Initial width in pixels
    const mainContentRef = useRef(null);

    const svgRef = useRef(null);
    const gRef = useRef(null);

    const nodeRadius = 50; // Adjust this value based on your node size

    // Derive selectedNode from nodes and selectedNodeId
    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId), [nodes, selectedNodeId]
    );

    // Add state to track selected port
    const [selectedPort, setSelectedPort] = useState(null);

    // Add a new state to track if the metadata editor is focused
    const [isMetadataEditorFocused, setIsMetadataEditorFocused] = useState(false);

    const isInitialLoad = useRef(true); // Add this line

    // Add this utility function at the top level of your component
    const getNodeDimensions = (node) => {
        const fontSize = 14; // Same as in your text element
        const padding = 0.5; // Padding around the text
        const approximateCharWidth = fontSize * 0.6; // Approximate width per character
        const textWidth = node.label.length * approximateCharWidth;

        const rectWidth = Math.max(textWidth + padding * 2, 100); // Minimum width of 100
        const rectHeight = Math.max(fontSize + padding * 2, 30); // Minimum height of 60

        return { rectWidth, rectHeight };
    };

    // Update isPointInsideNode function
    const isPointInsideNode = (point, node) => {
        const { rectWidth, rectHeight } = getNodeDimensions(node);

        const left = node.x - rectWidth / 2;
        const right = node.x + rectWidth / 2;
        const top = node.y - rectHeight / 2;
        const bottom = node.y + rectHeight / 2;

        return (
            point.x >= left &&
            point.x <= right &&
            point.y >= top &&
            point.y <= bottom
        );
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
        // Deselect the node when editing starts
        setSelectedNodeId(null);
    };

    // Update the handleMouseDown function
    const handleMouseDown = (event) => {
        // Check if the click is inside the metadata editor
        if (event.target.closest('.metadata-editor-container')) {
            return; // Exit the function early if the click is in the metadata editor
        }

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
                // Only deselect if we're not clicking in the metadata editor
                setSelectedNodeId(null);
            }
        }

        setSelectedPort(null); // Deselect port when clicking elsewhere
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
                n.id === draggedNode.id ? {...n, x: point.x, y: point.y } : n
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
        } else if (event.key === 'Backspace' && selectedNodeId) {
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
            label: '',
            metadata: {} // Initialize metadata field
        };
        setNodes(prevNodes => {
            const updatedNodes = [...prevNodes, newNode];
            saveState(updatedNodes, edges); // Use current edges
            return updatedNodes;
        });
        setSelectedNodeId(newNode.id);
        setEditingNode(newNode);
    };

    const deleteSelectedNode = () => {

        if (isMetadataEditorFocused || editingNode) {
            return
        }
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

    // Update the edge data structure to include ports
    // When creating an edge, include ports with labels
    const createEdge = (fromNodeId, toNodeId) => {
        if (!edgeExists(fromNodeId, toNodeId)) {
            const newEdge = {
                id: `edge-${Date.now()}`,
                fromNodeId,
                toNodeId,
                fromPort: { id: `port-${Date.now()}-from`, label: 'Output', metadata: {} },
                toPort: { id: `port-${Date.now()}-to`, label: 'Input', metadata: {} }
            };
            setEdges(prevEdges => {
                const updatedEdges = [...prevEdges, newEdge];
                saveState(nodes, updatedEdges);
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
        console.log('Updating metadata:', updatedMetadata);
        const nodeId = selectedNodeId || focusedNodeId; // Use focusedNodeId if selectedNodeId is null
        setNodes((prevNodes) => {
            const updatedNodes = prevNodes.map((node) =>
                node.id === nodeId ?
                { ...node, metadata: updatedMetadata } :
                node
            );
            console.log('Updated nodes:', updatedNodes);
            saveState(updatedNodes, edges);
            return updatedNodes;
        });
    };

    // Add functions to handle metadata editor focus
    const handleMetadataEditorFocus = (nodeId) => {
        setIsMetadataEditorFocused(true);
        setFocusedNodeId(nodeId);
        // Don't clear the selectedNodeId here
        // setSelectedNodeId(null);
    };

    const handleMetadataEditorBlur = () => {
        setIsMetadataEditorFocused(false);
        setFocusedNodeId(null);
    };

    // Update calculateIntersection function
    const calculateIntersection = (fromNode, toNode) => {
        const { rectWidth: fromNodeWidth, rectHeight: fromNodeHeight } = getNodeDimensions(fromNode);
        const { rectWidth: toNodeWidth, rectHeight: toNodeHeight } = getNodeDimensions(toNode);

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        const angle = Math.atan2(dy, dx);

        let intersectionX, intersectionY;

        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
            // Intersects with left or right side
            intersectionX = fromNode.x + Math.sign(dx) * (fromNodeWidth / 2);
            intersectionY = fromNode.y + dy * (fromNodeWidth / 2) / Math.abs(dx);
        } else {
            // Intersects with top or bottom side
            intersectionY = fromNode.y + Math.sign(dy) * (fromNodeHeight / 2);
            intersectionX = fromNode.x + dx * (fromNodeHeight / 2) / Math.abs(dy);
        }

        return { x: intersectionX, y: intersectionY };
    };

    // Update renderEdge function to use the new calculateIntersection
    const renderEdge = (edge) => {
        const fromNode = nodes.find(node => node.id === edge.fromNodeId);
        const toNode = nodes.find(node => node.id === edge.toNodeId);
        if (!fromNode || !toNode) return null;

        const startPoint = calculateIntersection(fromNode, toNode);
        const endPoint = calculateIntersection(toNode, fromNode);

        // Calculate the total length of the edge
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        const edgeLength = Math.sqrt(dx * dx + dy * dy);

        // Calculate positions for ports (1/3 and 2/3 along the edge)
        const oneThirdPoint = {
            x: startPoint.x + dx / 3,
            y: startPoint.y + dy / 3,
        };
        const twoThirdsPoint = {
            x: startPoint.x + 2 * dx / 3,
            y: startPoint.y + 2 * dy / 3,
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
                    isSelected={selectedPort && selectedPort.id === edge.fromPort.id}
                />
                <PortCircle
                    x={twoThirdsPoint.x}
                    y={twoThirdsPoint.y}
                    port={edge.toPort}
                    nodeId={edge.toNodeId}
                    color="blue"
                    onLabelChange={handlePortLabelChange}
                    onSelectPort={setSelectedPort}
                    isSelected={selectedPort && selectedPort.id === edge.toPort.id}
                />
            </g>
        );
    };

    // Update renderNode function to use getNodeDimensions
    const renderNode = (node) => {
        const { rectWidth, rectHeight } = getNodeDimensions(node);

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
                        x={-rectWidth / 2 + 5}
                        y={-rectHeight / 2 + 5}
                        width={rectWidth - 10}
                        height={rectHeight - 10}
                    >
                        <input
                            type="text"
                            value={node.label}
                            onChange={(e) => handleLabelChange(node.id, e.target.value)}
                            onBlur={() => {
                                setEditingNode(null);
                                saveState(nodes, edges);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.target.blur();
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
                        {node.label}
                    </text>
                )}
            </g>
        );
    };

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

    const handleSave = async () => {
        const serializedState = serializeState();
        try {
            // Open file picker and get a file handle to save to
            const handle = await window.showSaveFilePicker({
                suggestedName: 'dag-note-editor-state.json',
                types: [{
                    description: 'JSON File',
                    accept: {'application/json': ['.json']},
                }],
            });
            
            // Create a writable stream and write the data
            const writable = await handle.createWritable();
            await writable.write(serializedState);
            await writable.close();
            
            // alert('State saved successfully!');
        } catch (err) {
            console.error('Failed to save the file:', err);
            alert('Failed to save the file. Please try again.');
        }
    };

    const handleLoad = async () => {
        try {
            // Open file picker and get a file handle to read from
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON File',
                    accept: {'application/json': ['.json']},
                }],
                multiple: false
            });
            
            // Get the file contents
            const file = await handle.getFile();
            const contents = await file.text();
            
            deserializeState(contents);
            // alert('State loaded successfully!');
        } catch (err) {
            console.error('Failed to load the file:', err);
            alert('Failed to load the file. Please try again.');
        }
    };

    // {{ add_export_function }}
    const exportToDot = () => {
        let dot = 'digraph G {\n';
        nodes.forEach(node => {
            dot += `  "${node.id}" [label="${node.label}"];\n`;
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

    const handlePortLabelChange = (nodeId, portId, newLabel) => {
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
            saveState(nodes, updatedEdges);
            return updatedEdges;
        });
    };

    // Add a new function to handle label changes
    const handleLabelChange = (nodeId, newLabel) => {
        setNodes(prevNodes => {
            const updatedNodes = prevNodes.map(node =>
                node.id === nodeId ? {...node, label: newLabel} : node
            );
            saveState(updatedNodes, edges);
            return updatedNodes;
        });
    };

    // Add event handlers for resizing
    const handleMouseDownOnResizer = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = metadataEditorWidth;

        const handleMouseMove = (e) => {
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

    // Determine the node to pass to NodeMetadataEditor
    let nodeForEditor = selectedNode || nodes.find(node => node.id === focusedNodeId);

    if (!nodeForEditor && selectedPort) {
        // Find the node associated with the selectedPort
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

    console.log('Selected node:', selectedNode);
    console.log('Focused node ID:', focusedNodeId);

    // Add this useEffect to autosave the graph state
    useEffect(() => {
        if (nodes.length > 0 || edges.length > 0) {
            const serializedState = serializeState();
            localStorage.setItem('graphState', serializedState);
        }
    }, [nodes, edges, panOffset]);

    // Load saved state from local storage on component mount
    useEffect(() => {
        const savedState = localStorage.getItem('graphState');
        if (savedState) {
            deserializeState(savedState);
        } else {
            saveState(nodes, edges); // Optional: save initial empty state
        }
    }, []);

    // Add this new function to reset all states
    const resetAllState = () => {
        setNodes([]);
        setEdges([]);
        setIsShiftPressed(false);
        setIsDragging(false);
        setDraggedNode(null);
        setEdgeStart(null);
        setEdgePreview(null);
        setEditingNode(null);
        setIsPanning(false);
        setPanStart({ x: 0, y: 0 });
        setPanOffset({ x: 0, y: 0 });
        setSelectedNodeId(null);
        setHistory([]);
        setCurrentStateIndex(-1);
        setFocusedNodeId(null);
        setSelectedPort(null);
        setIsMetadataEditorFocused(false);

        // Clear local storage
        // localStorage.removeItem('graphState');

        // Save the empty state
        saveState([], []);
    };


    return (
        <div className="editor-container">
            <div className="toolbar">
                <button onClick={handleSave}>Save</button>
                <button onClick={handleLoad}>Load</button>
                <button onClick={exportToDot}>Export to DOT</button>
                <button onClick={resetAllState}>Reset All</button>
                {/* Add the new load from local storage button */}
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
                        tabIndex="0"
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
                {(selectedNode || focusedNodeId || selectedPort) && (
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
                                port={selectedPort}
                                onUpdate={handleMetadataUpdate}
                                onFocus={() => handleMetadataEditorFocus(nodeForEditor ? nodeForEditor.id : null)}
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

export default DAGNoteEditor;