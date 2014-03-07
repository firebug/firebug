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

                    var tests = new FBTest.TaskList();

                    // 4. Inside the Style side panel right-click on the color value 'background' property
                    //    inside the '#element' rule
                    // 5. Click the 'Copy Color' menu item
                    tests.push(executeTest, propValue, {x: 360, y: 5}, "fbCopyColor", "#8c8cff",
                        verifyCopyColor);

                    // 7. Right-click on the image value (url(firebug.png)) of the 'background' property
                    // 8. Click the 'Copy Image Location' menu item
                    tests.push(executeTest, propValue, {x: 10, y: 5}, "fbCopyImageLocation",
                        basePath + "html/style/5672/firebug.png", verifyCopyImageLocation);

                    // 10. Right-click on the image value (url(firebug.png)) of the 'background' property
                    // 11. Click the 'Open Image In New Tab' menu item
                    tests.push(executeTest, propValue, {x: 10, y: 5}, "fbOpenImageInNewTab",
                        basePath + "html/style/5672/firebug.png", verifyOpenImageInNewTab);

                    tests.run(function()
                    {
                        FBTest.testDone("issue5672.DONE");
                    });
                });
            });
        });
    });
}


function executeTest(callback, propValue, offset, contextMenuItemID, expected,
    contextMenuCallback)
{
    FBTest.executeContextMenuCommand(propValue, contextMenuItemID, () =>
    {
        contextMenuCallback(expected, callback);
    }, callback, offset);
}

function verifyCopyColor(expected, callback)
{
    FBTest.waitForClipboard(expected, (cssPath) =>
    {
        // 6. Paste the clipboard content into a text editor
        var clipboardText = FBTest.getClipboardText();
        FBTest.compare(expected, clipboardText,
            "Color value must be properly copied to the clipboard");
        callback();
    });
}

function verifyCopyImageLocation(expected, callback)
{
    FBTest.waitForClipboard(expected, (cssPath) =>
    {
        // 9. Paste the clipboard content into a text editor
        var clipboardText = FBTest.getClipboardText();
        FBTest.compare(expected, clipboardText,
            "Image URL must be properly copied to the clipboard");
        callback();
    });
}

function verifyOpenImageInNewTab(expected, callback)
{
    var tabBrowser = FBTest.getBrowser();
    var tab = tabBrowser.mCurrentTab;
    var browser = tab.linkedBrowser;
    if (FBTest.compare(expected, browser.documentURI.spec, "URL of the image must be correct"))
    {
        // Close the tab again
        tabBrowser.removeTab(tab);
    }

    callback();
}
