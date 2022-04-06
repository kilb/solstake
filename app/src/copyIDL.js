const fs = require('fs');
const idl = require('../../target/idl/solstake.json');

fs.writeFileSync('./idl.json', JSON.stringify(idl));