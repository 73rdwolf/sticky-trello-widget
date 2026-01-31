const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'assets', 'icon.png');

// Create a 256x256 icon for electron-builder
sharp(inputPath)
    .resize(256, 256)
    .png()
    .toFile(path.join(__dirname, 'assets', 'icon-256.png'))
    .then(() => {
        console.log('Created 256x256 icon at assets/icon-256.png');
        console.log('Icon ready for electron-builder');
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
