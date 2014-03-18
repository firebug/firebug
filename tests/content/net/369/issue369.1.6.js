function runTest()
{
    FBTest.openNewTab(basePath + "net/369/issue369.1.6.htm", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var numberOfRequests = 5;

                var options = {
                    tagName: "tr",
                    classes: "netRow category-xhr hasHeaders loaded",
                    counter: numberOfRequests
                };

                FBTest.waitForDisplayedElement("net", options, function(row)
                {
                    verifyContent(numberOfRequests);
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton1"));
                FBTest.click(win.document.getElementById("testButton2"));
                FBTest.click(win.document.getElementById("testButton3"));
                FBTest.click(win.document.getElementById("testButton4"));
                // xxxHonza: Not implemented yet.
                //FBTest.click(win.document.getElementById("testButton5"));
                //FBTest.click(win.document.getElementById("testButton6"));
                FBTest.click(win.document.getElementById("testButton7"));
            });
        });
    });
}

function verifyContent(numberOfRequests)
{
    var panelNode = FBTest.getPanel("net").panelNode;
    var rows = FBTest.expandElements(panelNode, "netRow", "category-xhr");
    var tabs = FBTest.expandElements(panelNode, "netInfoJSONTab");

    FBTest.ok(rows.length == numberOfRequests, "There must be " +
        numberOfRequests + " requests in the Net panel.");
    FBTest.ok(tabs.length == numberOfRequests, "There must be " +
        numberOfRequests + " JSON tabs in the net panel.");

    if (rows.length != numberOfRequests || tabs.length != numberOfRequests)
        return FBTest.testDone();

    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        var nextSibling = row.nextSibling;
        var jsonBody = FW.FBL.getElementByClass(nextSibling, "netInfoJSONText", "netInfoText");
        var domTable = FW.FBL.getElementByClass(jsonBody, "domTable");

        var label = FW.FBL.getElementByClass(row, "netFullHrefLabel", "netHrefLabel");

        FBTest.ok(domTable, "JSON tree must exist for: " + label.textContent);
        FBTest.ok(textContent, domTable.textContent, "JSON data must be properly displayed.");
    }
}

// ************************************************************************************************

var textContent = "addressObject streetAddress=21 2nd Street city=New York state=NY" +
    "firstName\"John\"lastName\"Smith\"phoneNumbers[\"212 555-1234\", \"646 555-4567\" 0=" +
    "212 555-1234 1=646 555-4567]";
