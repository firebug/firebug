function runTest()
{
    FBTest.openNewTab(basePath + "html/4542/issue4542.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");

            var tasks = new FBTest.TaskList();
            tasks.push(checkQuotesInId);
            tasks.push(checkQuotesInOnClick, panel, win);
            tasks.push(checkQuotesInStyle, panel, win);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function checkQuotesInId(callback)
{
    FBTest.progress("Check quotes in 'id'");

    FBTest.selectElementInHtmlPanel("sayHi", function(node)
    {
        var attributes = node.getElementsByClassName("nodeAttr");

        clickAttributeValue(attributes, "id", function(attribute, editor)
        {
            // Enter a double quote
            FBTest.sendChar("\"", editor);
            if (FBTest.ok(editor, "Editor must still be available"))
                FBTest.ok(editor.value != "\"", "Editor must be at the next attribute now");

            callback();
        });
    });
}

function checkQuotesInOnClick(callback, panel, win)
{
    FBTest.progress("Check quotes in 'onclick'");

    FBTest.selectElementInHtmlPanel("sayHi", function(node)
    {
        var attributes = node.getElementsByClassName("nodeAttr");

        clickAttributeValue(attributes, "onclick", function(attribute, editor)
        {
            // Move text cursor at the beginning of the input field.
            var key = FBTest.isMac() ? "LEFT" : "HOME";
            FBTest.sendKey(key, editor);

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
                FBTest.synthesizeMouse(attribute);
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
                FBTest.synthesizeMouse(attribute);
                editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
            }

            FBTest.compare(/"Hi/, editor.value, "Double quote must be entered");

            // Click outside the CSS selector to stop inline editing
            FBTest.synthesizeMouse(panel.panelNode, 0, 0);

            FBTest.click(win.document.getElementById("sayHi"));
            FBTest.compare("Hi there, tester!",
                win.document.getElementById("output").textContent,
                "Changes in panel must effect page content");

            callback();
        });
    });
}

function checkQuotesInStyle(callback, panel, win)
{
    FBTest.progress("Check quotes in 'style'");

    FBTest.selectElementInHtmlPanel("sayHi", function(node)
    {
        var attributes = node.getElementsByClassName("nodeAttr");

        clickAttributeValue(attributes, "style", function(attribute, editor)
        {
            var buttonDisplayBefore = FBTest.getImageDataFromNode(
                win.document.getElementById("sayHi"));

            // Move text cursor at the beginning of the input field.
            var key = FBTest.isMac() ? "LEFT" : "HOME";
            FBTest.sendKey(key, editor);

            // Move text cursor after the opening bracket of
            // 'background-image: url(firebug.png');'
            for (var i=0; i<22; i++)
                FBTest.sendKey("RIGHT", editor);

            // Enter a single quote
            FBTest.sendChar("'", editor);

            if (!FBTest.ok(editor, "Editor must still be available") &&
                !FBTest.compare(/^var output/, editor.value, "Editor must not jump "+
                    "to the next editable item when a single quote is entered"))
            {
                FBTest.synthesizeMouse(attribute);
                editor = panel.panelNode.getElementsByClassName("textEditorInner").item(0);
            }

            FBTest.compare(/background-image: url\('firebug.png'\)/, editor.value,
                "Single quote must be entered");

            // Click outside the CSS selector to stop inline editing
            FBTest.synthesizeMouse(panel.panelNode, 0, 0);

            var buttonDisplayAfter = FBTest.getImageDataFromNode(
                win.document.getElementById("sayHi"));
            FBTest.ok(buttonDisplayBefore != buttonDisplayAfter,
                "The button display must have changed");

            callback();
        });
    });
}

// ********************************************************************************************* //

function clickAttributeValue(attributes, name, callback)
{
    var attribute;
    for (var i = 0; i < attributes.length; ++i)
    {
        attribute = attributes[i];
        if (attribute.getElementsByClassName("nodeName").item(0).textContent == name)
            break;
    }

    var attributeValue = attribute.getElementsByClassName("nodeValue").item(0);

    FBTest.synthesizeMouse(attributeValue);

    var editor = FW.FBL.getAncestorByClass(attribute, "panelNode").
        getElementsByClassName("textEditorInner").item(0);

    if (FBTest.ok(editor, "Editor must be available now"))
        callback(attribute, editor);
}
