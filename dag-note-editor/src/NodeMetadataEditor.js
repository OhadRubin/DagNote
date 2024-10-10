import React from 'react';

const NodeMetadataEditor = ({ node, onUpdate, onFocus, onBlur }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onUpdate({...node.metadata, [name]: value });
    };

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
        /> < /
        label > <
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
        /> < /
        label > { /* Add more fields as needed */ } <
        /div>
    );
};

export default NodeMetadataEditor;