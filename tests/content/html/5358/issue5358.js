var basePath5358 = basePath+"html/5358/";
function runTest()
{
    FBTest.openNewTab(basePath5358 + "issue5358.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("html");
            if (FBTest.ok(panel, "Firebug must be opened and switched to HTML panel now."))
            {
                // ***********************************************************************************//
                // HTML

                // Test functionality must be placed here
                var tasks = new FBTest.TaskList();
                tasks.push(copyAndPasteContent, "onlyCell", "fbPasteReplaceOuter",
                    '<td id="middleCell">Foo!</td>');
                tasks.push(copyAndPasteContent, "middleCell", "fbPasteReplaceInner",
                    '<b id="boldMiddleCell">Middle</b>');
                tasks.push(copyAndPasteContent, "middleRow", "fbPasteFirstChild",
                    '<td id="leftCell">Left</td>');
                tasks.push(copyAndPasteContent, "middleRow", "fbPasteLastChild",
                    '<td id="rightCell">Right</td>');
                tasks.push(copyAndPasteContent, "middleRow", "fbPasteBefore",
                    '<tr id="topRow"><td colspan="3" id="topCell">Top</td></tr>');
                tasks.push(copyAndPasteContent, "middleRow", "fbPasteAfter",
                    '<tr id="bottomRow"><td colspan="3" id="bottomCell">Bottom</td></tr>');

                tasks.push(checkTableContent);

                // check that the "Replace Node", "Before" and "After" items are disabled
                tasks.push(checkDisabledItemsOnRootElement);

                // ***********************************************************************************//
                // XML

                tasks.push(FBTest.openURL.bind(FBTest, basePath5358 + "issue5358_xml.html"));

                // set the new context baseWindow
                tasks.push(setBaseWindow);
                // run the tests:
                tasks.push(copyAndPasteXMLContent, "onlyContent", "fbPasteReplaceOuter",
                    '<item id="3">Item Number</item>');
                tasks.push(copyAndPasteXMLContent, "3", "fbPasteReplaceInner", "3");
                tasks.push(copyAndPasteXMLContent, "root", "fbPasteFirstChild",
                    '<item id="2">2</item>');
                tasks.push(copyAndPasteXMLContent, "root", "fbPasteLastChild", '<item id="4">4</item>');
                tasks.push(copyAndPasteXMLContent, "2", "fbPasteBefore", '<item id="1">1</item>');
                tasks.push(copyAndPasteXMLContent, "4", "fbPasteAfter", '<item id="5">5</item>');

                tasks.push(checkXMLContent);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            }
        });
    });
}

function copyAndPasteContent(callback, target, menuId, contentToPaste)
{
    FBTest.selectElementInHtmlPanel(target, function(nodeBox)
    {
        function copy()
        {
            FBTest.setClipboardText(contentToPaste);
        }

        // The clipboard content might be set asynchronously on some machines.
        FBTest.waitForClipboard(contentToPaste, copy, function()
        {
            FBTest.executeContextMenuCommand(nodeBox, menuId, callback);
        });
    });
}

function copyAndPasteXMLContent(callback, targetId, menuId, contentToPaste)
{
    var doc = FW.Firebug.currentContext.baseWindow.document;
    // getElementById does not work on XML documents. Here is a workaround:
    var target = doc.querySelector("*[id='"+targetId+"']");
    copyAndPasteContent(callback, target, menuId, contentToPaste);
}


function checkDisabledItemsOnRootElement(callback)
{
    var root = FW.Firebug.currentContext.window.document.documentElement;

    FBTest.getPanel("html").select(root);
    var nodeBox = FBTest.getSelectedNodeBox();
    var popup = FW.FBL.$("fbContextMenu");
    function onContextMenuCommandUpdate()
    {
        try
        {
            var $ = popup.ownerDocument.getElementById.bind(popup.ownerDocument);
            FBTest.ok($("fbPasteReplaceOuter").getAttribute("disabled") === "true",
                '#fbPasteReplaceOuter should be disabled');
            FBTest.ok($("fbPasteAfter").getAttribute("disabled") === "true",
                '#fbPasteAfter should be disabled');
            FBTest.ok($("fbPasteBefore").getAttribute("disabled") === "true",
                '#fbPasteBefore should be disabled');
        }
        finally
        {
            callback();
        }
    }

    // dummy action to update the context menu:
    FBTest.executeContextMenuCommand(nodeBox, "fbCopyCSSPath", onContextMenuCommandUpdate);
}

function checkTableContent(callback)
{
    // Do the querySelectorAll to check whether the elements are placed in the right order.
    var childrenOk = FW.Firebug.currentContext.window.document.querySelectorAll(
        "#table > tbody > #topRow:nth-child(1) > #topCell, "+
        "#table > tbody > #middleRow:nth-child(2) > #leftCell, "+
        "#table > tbody > #middleRow:nth-child(2) > #middleCell > #boldMiddleCell:only-child, "+
        "#table > tbody > #middleRow:nth-child(2) > #rightCell, "+
        "#table > tbody > #bottomRow:nth-child(3) > #bottomCell:only-child"
    );
    FBTest.compare(5, childrenOk.length,
        "the table should contain 5 cells: Top, Left, Middle, Right and Bottom");
    Array.forEach(childrenOk, function(e)
    {
        FBTest.ok(true, "found element: #"+e.id);
    });
    callback();
}

function checkXMLContent(callback)
{
    // Hack: remove the style element that will trouble the querySelectorAll below.
    var doc = FW.Firebug.currentContext.baseWindow.document;
    var style = doc.querySelector("style");
    if (style)
        style.remove();

    // Do the querySelectorAll to check whether the elements are placed in the right order.
    var childrenOk = doc.querySelectorAll(
        "root > item[id='1']:nth-child(1), "+
        "root > item[id='2']:nth-child(2), "+
        "root > item[id='3']:nth-child(3), "+
        "root > item[id='4']:nth-child(4), "+
        "root > item[id='5']:nth-child(5)"
    );
    FBTest.compare(5, childrenOk.length,
        "the XML Document should contain 5 items: 1, 2, 3, 4, 5");
    callback();
}

function setBaseWindow(callback)
{
    var doc = FW.Firebug.currentContext.window.document;
    FW.Firebug.currentContext.baseWindow = doc.querySelector("iframe").contentWindow;
    callback();
}
