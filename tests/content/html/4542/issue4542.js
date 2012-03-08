function runTest()
{
    FBTest.sysout("issue4542.START");
    FBTest.openNewTab(basePath + "html/4542/issue4542.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("html");

        FBTest.selectElementInHtmlPanel("sayHi", function(node)
        {
            var attributes = node.getElementsByClassName("nodeAttr");
            var i;

            hasOnClickAttribute = false;
            for (i=0; i<attributes.length; i++)
            {
                var nodeName = attributes[i].getElementsByClassName("nodeName").item(0);
                if (nodeName.textContent == "onclick")
                {
                    hasOnClickAttribute = true;
                    break;
                }
            }

            if (FBTest.ok(hasOnClickAttribute, "There must be an 'onclick' attribute"))
            {
                var nodeValue = attributes[i].getElementsByClassName("nodeValue").item(0);
                // Click the attribute value to open the inline editor
                var boundingClientRect = nodeValue.getBoundingClientRect();
                var firstClientRect = nodeValue.getClientRects()[0];

                if (FBTrace.DBG_FBTEST)
                    FBTrace.sysout("clientrect", {cr: firstClientRect, bcr: boundingClientRect});

                FBTest.synthesizeMouse(nodeValue, firstClientRect.left-boundingClientRect.left,
                    firstClientRect.top-boundingClientRect.top);

                var editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    FBTest.sendKey("HOME", editor);
                    // Move text cursor between the opening bracket and 'output' of
                    // 'getElementById(output')'
                    for (var i=0; i<37; i++)
                        FBTest.sendKey("RIGHT", editor);
      
                    // Enter a single quote
                    FBTest.sendChar("'", editor);

                    if (!FBTest.ok(editor, "Editor must still be available") &&
                        !FBTest.compare(/^var output/, editor.value, "Editor must not jump "+
                            "to the next editable item when a single quote is entered"))
                    {
                        FBTest.synthesizeMouse(nodeValue, firstClientRect.left-boundingClientRect.left,
                            firstClientRect.top-boundingClientRect.top);
                        editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                    }

                    FBTest.compare(/getElementById\('output'\)/, editor.value,
                        "Single quote must be entered");
    
                    // Move text cursor before the 'H' of 'Hi'
                    for (var i=0; i<61; i++)
                        FBTest.sendKey("RIGHT", editor);

                    // Enter a double quote
                    FBTest.sendChar("\"", editor);

                    if (!FBTest.ok(editor, "Editor must still be available") &&
                        !FBTest.compare(/^var output/, editor.value, "Editor must not jump "+
                            "to the next editable item when a double quote is entered"))
                    {
                        FBTest.synthesizeMouse(nodeValue, firstClientRect.left-boundingClientRect.left,
                            firstClientRect.top-boundingClientRect.top);
                        editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                    }

                    FBTest.compare(/"Hi/, editor.value, "Double quote must be entered");
                }

                FBTest.testDone("issue4542.DONE");
            }
        });
    });
}
