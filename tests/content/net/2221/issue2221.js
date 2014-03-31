// 1) Load Test case page.
// 2) Enable Net panel
// 3) Add "load" listener to the target iframe so, the test knows when
//    the reponse for submitted form is received.
// 4) Check the Post info UI.

var panel = null;
function runTest()
{
    FBTest.openNewTab(basePath + "net/2221/issue2221.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            var doc = win.document;

            // Select the Net panel.
            panel = FW.Firebug.chrome.selectPanel("net");
            panel.clear();

            // Add listener to the target form IFrame.
            var target = doc.getElementById("my_target");
            target.addEventListener("load", function() {
                setTimeout(onLoadResponse, 400);
            }, true);

            FBTest.sysout("issue2221; Submit test form");

            // Submit test form.
            FBTest.click(doc.getElementById("userSubmit"));
        });
    });
}

function onLoadResponse()
{
    FBTest.sysout("issue2221; Test form submitted and response received.");

    // Get Net panel reqeust entry.
    var netRow = FW.FBL.getElementByClass(panel.panelNode, "netRow",
        "category-html", "hasHeaders", "loaded");

    if (!FBTest.ok(netRow, "There must be one request."))
        return FBTest.testDone();

    FBTest.click(netRow);

    // Get info row and select Post tab.
    var netInfoRow = netRow.nextSibling;
    FBTest.expandElements(netInfoRow, "netInfoPostTab");

    var postTable = FW.FBL.getElementByClass(netInfoRow, "netInfoPostTable");
    if (FBTest.ok(postTable, "There must be table with posted parameters."))
    {
        var paramName = FW.FBL.getElementByClass(postTable, "netInfoParamName");
        var paramValue = FW.FBL.getElementByClass(postTable, "netInfoParamValue");

        if (FBTest.ok(paramName && paramValue, "There must be name and value displayed."))
        {
            var expectedValue = unescape("%E5%E4%F6%FC%E9");

            FBTest.compare("param1", paramName.textContent, "The parameter name must be 'param1'.");
            FBTest.compare(expectedValue, paramValue.textContent, "The parameter value must be: " +
                expectedValue);
        }
    }

    FBTest.testDone();
}
