import React from 'react';
import DAGNoteEditor from './DAGNoteEditor';

function App() {
    return ( <
        div className = "App" >
        <
        h1 > DAG Note Editor < /h1> <
        // p > -double click to create a node < /p> <
        // p > -shift + drag to create an edge < /p> <
        // p > -drag to pan < /p> <
        // p > -double click inside node to edit text < /p>   <
        DAGNoteEditor / >
        <
        /div>
    );
}

export default App;