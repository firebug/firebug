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

            clickAttributeValue(attributes, "id", function(attribute, editor) {
                // Enter a double quote
                FBTest.sendChar("\"", editor);
                if (FBTest.ok(editor, "Editor must still be available"))
                    FBTest.ok(editor.value != "\"", "Editor must be at the next attribute now");
            });
  
            clickAttributeValue(attributes, "onclick", function(attribute, editor) {
                // Move text cursor between the opening bracket and 'output' of
                // 'getElementById(output')'
                FBTest.sendKey("HOME", editor);
                for (var i=0; i<37; i++)
                    FBTest.sendKey("RIGHT", editor);
  
                // Enter a single quote
                FBTest.sendChar("'", editor);
  
                if (!FBTest.ok(editor, "Editor must still be available") &&
                    !FBTest.compare(/^var output/, editor.value, "Editor must not jump "+
                        "to the next editable item when a single quote is entered"))
                {
                    FBTest.synthesizeMouse(attribute, firstClientRect.left-boundingClientRect.left,
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
                    FBTest.synthesizeMouse(attribute, firstClientRect.left-boundingClientRect.left,
                        firstClientRect.top-boundingClientRect.top);
                    editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                }
  
                FBTest.compare(/"Hi/, editor.value, "Double quote must be entered");

                // Click outside the CSS selector to stop inline editing
                FBTest.synthesizeMouse(panel.panelNode, 0, 0);


                FBTest.click(win.document.getElementById("sayHi"));
                FBTest.compare("Hi there, tester!", win.document.getElementById("output").textContent, "Changes in panel must effect page content");
            });

            clickAttributeValue(attributes, "style", function(attribute, editor) {
                var buttonDisplayBefore = FBTest.getImageDataFromNode(win.document.getElementById("sayHi"));

                // Move text cursor after the opening bracket of 'background-image: url(firebug.png');'
                FBTest.sendKey("HOME", editor);
                for (var i=0; i<22; i++)
                    FBTest.sendKey("RIGHT", editor);

                // Enter a single quote
                FBTest.sendChar("'", editor);

                if (!FBTest.ok(editor, "Editor must still be available") &&
                    !FBTest.compare(/^var output/, editor.value, "Editor must not jump "+
                        "to the next editable item when a single quote is entered"))
                {
                    FBTest.synthesizeMouse(attribute, firstClientRect.left-boundingClientRect.left,
                        firstClientRect.top-boundingClientRect.top);
                    editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
                }

                FBTest.compare(/background-image: url\('firebug.png'\)/, editor.value,
                    "Single quote must be entered");
  
                // Click outside the CSS selector to stop inline editing
                FBTest.synthesizeMouse(panel.panelNode, 0, 0);

                var buttonDisplayAfter = FBTest.getImageDataFromNode(win.document.getElementById("sayHi"));
                FBTest.ok(buttonDisplayBefore != buttonDisplayAfter, "The button display must have changed");
             });
             FBTest.testDone("issue4542.DONE");
        });
    });
}

//************************************************************************************************

function clickAttributeValue(attributes, name, callback)
{
    var attribute;
    for each (attribute in attributes)
    {
        if (attribute.getElementsByClassName("nodeName").item(0).textContent == name)
            break;
    }
    var attributeValue = attribute.getElementsByClassName("nodeValue").item(0);
  
    // Click the attribute value to open the inline editor
    var boundingClientRect = attributeValue.getBoundingClientRect();
    var firstClientRect = attributeValue.getClientRects()[0];
  
    if (FBTrace.DBG_FBTEST)
        FBTrace.sysout("clientrect", {cr: firstClientRect, bcr: boundingClientRect});
  
    FBTest.synthesizeMouse(attributeValue, firstClientRect.left-boundingClientRect.left,
        firstClientRect.top-boundingClientRect.top);

    var editor = FW.FBL.getAncestorByClass(attribute, "panelNode").
        getElementsByClassName("textEditorInner").item(0);
    if (FBTest.ok(editor, "Editor must be available now"))
        callback(attribute, editor);
}