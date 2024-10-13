import React from 'react';

const NodeMetadataEditor = ({ node, onUpdate, onFocus, onBlur, edges, onPortLabelChange }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({...node.metadata, [name]: value });
    };

    const connectedEdges = edges.filter(edge => edge.fromNodeId === node.id || edge.toNodeId === node.id);

    return ( <
        div className = "metadata-editor" >
        <
        h3 > Edit Node Metadata < /h3> <
        label >
        <
        span > Title: < /span> <
        input name = "title"
        value = { node.metadata.title || '' }
        onChange = { handleChange }
        onFocus = { onFocus }
        onBlur = { onBlur }
        /> <
        /label> <
        br / >
        <
        label >
        <
        span > Description: < /span> <
        textarea name = "description"
        value = { node.metadata.description || '' }
        onChange = { handleChange }
        onFocus = { onFocus }
        onBlur = { onBlur }
        /> <
        /label> <
        h4 > Connected Ports < /h4> {
            connectedEdges.map(edge => ( <
                div key = { edge.id } > {
                    edge.fromNodeId === node.id && ( <
                        label >
                        <
                        span > Output Port: < /span> <
                        input value = { edge.fromPort.label }
                        onChange = {
                            (e) => onPortLabelChange(node.id, edge.fromPort.id, e.target.value) }
                        onFocus = { onFocus }
                        onBlur = { onBlur }
                        /> <
                        /label>
                    )
                } {
                    edge.toNodeId === node.id && ( <
                        label >
                        <
                        span > Input Port: < /span> <
                        input value = { edge.toPort.label }
                        onChange = {
                            (e) => onPortLabelChange(node.id, edge.toPort.id, e.target.value) }
                        onFocus = { onFocus }
                        onBlur = { onBlur }
                        /> <
                        /label>
                    )
                } <
                /div>
            ))
        } <
        /div>
    );
};

export default NodeMetadataEditor;