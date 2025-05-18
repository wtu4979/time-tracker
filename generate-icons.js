const fs = require('fs');
const sharp = require('sharp');

const sizes = [16, 48, 128];

async function generateIcons() {
    const svgBuffer = fs.readFileSync('./icons/icon.svg');
    
    for (const size of sizes) {
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(`./icons/icon${size}.png`);
        
        console.log(`Generated ${size}x${size} icon`);
    }
}

generateIcons().catch(console.error); 