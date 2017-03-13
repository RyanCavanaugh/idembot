import express = require('express');

const app = express();

app.get('/', (req, res) => {
    res.send('{}');
});

app.post('/', (req, res) => {
    
});

const server = app.listen(80, () => {
    console.log('Test server is running');
});

