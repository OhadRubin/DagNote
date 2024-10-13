import * as React from 'react';
import * as ReactDOM from 'react-dom';
import DAGNoteEditor from './DAGNoteEditor';
import './styles.css';

ReactDOM.render(
  <React.StrictMode>
    <DAGNoteEditor />
  </React.StrictMode>,
  document.getElementById('root')
);
