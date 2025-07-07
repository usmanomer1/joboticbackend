#!/bin/bash

# Add DISABLE_PDF2HTMLEX environment variable to Railway
echo "Setting DISABLE_PDF2HTMLEX=true in Railway..."
echo "Please add this environment variable manually in the Railway dashboard:"
echo ""
echo "Variable Name: DISABLE_PDF2HTMLEX"
echo "Value: true"
echo ""
echo "This will enable the fallback text extraction method while pdf2htmlEX is being installed."
echo ""
echo "After the Docker build completes successfully, you can remove this variable or set it to false."