#!/bin/bash

echo "📄 Converting BankIQ+ Project Overview to PDF..."
echo ""

# Check if pandoc is installed
if ! command -v pandoc &> /dev/null; then
    echo "❌ Pandoc not found. Installing..."
    brew install pandoc basictex
    echo "✅ Pandoc installed"
fi

# Convert markdown to PDF
pandoc BankIQ_Plus_Project_Overview.md \
    -o BankIQ_Plus_Project_Overview.pdf \
    --pdf-engine=pdflatex \
    -V geometry:margin=1in \
    -V fontsize=11pt \
    -V documentclass=article \
    --toc \
    --toc-depth=2

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ PDF created successfully!"
    echo "📄 Location: $(pwd)/BankIQ_Plus_Project_Overview.pdf"
    echo ""
    echo "Opening PDF..."
    open BankIQ_Plus_Project_Overview.pdf
else
    echo ""
    echo "❌ PDF conversion failed"
    echo ""
    echo "Alternative: Use online converter"
    echo "1. Go to: https://www.markdowntopdf.com/"
    echo "2. Upload: BankIQ_Plus_Project_Overview.md"
    echo "3. Download PDF"
fi
