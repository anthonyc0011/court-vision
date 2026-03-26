#!/bin/bash

echo "🧹 Cleaning old builds..."
rm -rf build dist *.spec

echo "📦 Installing required packages..."
python3 -m pip install pandas numpy openpyxl pyinstaller

echo "🚀 Building the app..."

python3 -m PyInstaller \
--onefile \
--windowed \
--hidden-import=pandas \
--hidden-import=numpy \
--hidden-import=openpyxl \
--add-data "ALL_NBA_PLAYERS.xlsx:." \
excel_quiz_mac.py

echo ""
echo "✅ BUILD COMPLETE!"
echo "📁 Your app is inside the DIST folder."
echo ""
