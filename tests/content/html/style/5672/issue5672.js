function runTest()
{
    FBTest.openNewTab(basePath + "html/style/5672/issue5672.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Switch to the HTML panel and there to the Style side panel
            var panel = FBTest.selectPanel("css");

            // Required to avoid line breaking the value of the 'background' property,
            // which causes problems hitting the right target when calling the context menu
            FBTest.setSidePanelWidth(550);

            // 3. Inspect the blue <div> with the Firebug logo
            FBTest.selectElementInHtmlPanel("element", function(node)
            {

                FBTest.getCSSProp("#element", "background", function(prop) {
                    var propValue = prop.getElementsByClassName("cssPropValue")[0];

                    var tests = [];
                    tests.push(function(callback)
                    {
                        copyColor(propValue, callback);
                    });

                    tests.push(function(callback)
                    {
                        copyImageURL(propValue, callback);
                    });

                    tests.push(function(callback)
                    {
                        openImageInNewTab(propValue, callback);
                    });

                    FBTestFirebug.runTestSuite(tests, function()
                    {
                        FBTest.testDone("issue5672.DONE");
                    });
                });
            });
        });
    });
}

function copyColor(propValue, callback)
{
    var offset = {x: 380, y: 2};
    var config = {tagName: "div", classes: "infoTipColorBox"};
    FBTest.waitForDisplayedElement("css", config, function (infoTip)
    {
        var expected = "#8c8cff";

        // 4. Inside the Style side panel right-click on the color value 'background' property
        //    inside the '#element' rule
        // 5. Click the 'Copy Color' menu item
        FBTest.executeContextMenuCommand(propValue, "fbCopyColor", function() {
            FBTest.waitForClipboard(expected, function(cssPath)
            {
                // 6. Paste the clipboard content into a text editor
                var clipboardText = FBTest.getClipboardText();
                FBTest.compare(expected, clipboardText,
                    "Color value must be properly copied to the clipboard");
                callback();
            });
        }, callback, offset);

        // Hide the info tip by moving mouse over the CSS prop name,
        // otherwise it could block the mouse-move over the next CSS value.
        // (fixex failure on Mac).
        FBTest.mouseOver(FBTest.getSelectedPanel().panelNode, 0, 0);
    });

    // xxxsz: By hovering the value the infotip is shown. This is required, because the infotip
    // currently gets the type of the hovered property value, which is reused by the context menu
    FBTest.mouseOver(propValue, offset.x, offset.y);
}

function copyImageURL(propValue, callback)
{
    var offset = {x: 2, y: 2};
    var config = {tagName: "div", classes: "infoTipImageBox"};
    FBTest.waitForDisplayedElement("css", config, function (infoTip)
    {
        var expected = basePath + "html/style/5672/firebug.png";

        // 7. Right-click on the image value (url(firebug.png)) of the 'background' property
        // 8. Click the 'Copy Image Location' menu item
        FBTest.executeContextMenuCommand(propValue, "fbCopyImageLocation", function() {
            FBTest.waitForClipboard(expected, function(cssPath)
            {
                // 9. Paste the clipboard content into a text editor
                var clipboardText = FBTest.getClipboardText();
                FBTest.compare(expected, clipboardText,
                    "Image URL must be properly copied to the clipboard");
                callback();
            });
        }, callback, offset);

        // Hide the info tip by moving mouse over the CSS prop name,
        // otherwise it could block the mouse-move over the next CSS value.
        // (fixex failure on Mac).
        FBTest.mouseOver(FBTest.getSelectedPanel().panelNode, 0, 0);
    });

    // xxxsz: By hovering the value the infotip is shown. This is required, because the infotip
    // currently gets the type of the hovered property value, which is reused by the context menu
    FBTest.mouseOver(propValue, offset.x, offset.y);
}

function openImageInNewTab(propValue, callback)
{
    var offset = {x: 2, y: 2};
    var config = {tagName: "div", classes: "infoTipImageBox"};
    FBTest.waitForDisplayedElement("css", config, function (infoTip)
    {
        var expected = basePath + "html/style/5672/firebug.png";

        // 10. Right-click on the image value (url(firebug.png)) of the 'background' property
        // 11. Click the 'Open Image In New Tab' menu item
        FBTest.executeContextMenuCommand(propValue, "fbOpenImageInNewTab", function() {
            // xxxsz: New browser tab isn't opened for some reason
            var browser = FBTest.getCurrentTabBrowser();
            FBTest.compare(expected, browser.documentURI.spec, "URL of the image must be correct");

            callback();
        }, callback, offset);

        // Hide the info tip by moving mouse over the CSS prop name,
        // otherwise it could block the mouse-move over the next CSS value.
        // (fixex failure on Mac).
        FBTest.mouseOver(propValue, offset.x, offset.y);
    });

    // xxxsz: By hovering the value the infotip is shown. This is required, because the infotip
    // currently gets the type of the hovered property value, which is reused by the context menu
    FBTest.mouseOver(propValue, offset.x, offset.y);
}
