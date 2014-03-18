// Test response.
var bodyContent = "<span style=\"color: green;\">Response for Issue700.html</span>";
var htmlResponse = "<html><head/><body>" + bodyContent + "</body></html>";

// Test entry point.
function runTest()
{
    FBTest.openNewTab(basePath + "net/700/issue700-1.6.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                var panelNode = FBTest.getPanel("net").panelNode;
                FBTest.click(netRow);
                expandHTMLPreview();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function expandHTMLPreview()
{
    var panelNode = FBTest.getPanel("net").panelNode;
    FBTest.expandElements(panelNode, "netInfoHtmlTab");
    checkHTMLPreview();
}

function checkHTMLPreview()
{
    var panelNode = FBTest.getPanel("net").panelNode;
    var htmlPreview = FW.FBL.getElementByClass(panelNode, "netInfoHtmlPreview");
    FBTest.ok(htmlPreview, "Html preview must exist.");

    // Compare content with expected result.
    var body = htmlPreview.contentDocument.getElementsByTagName("body")[0];
    FBTest.sysout("body", body);
    FBTest.compare(bodyContent, body.innerHTML, "HTML preview verified.");
    FBTest.testDone();
}
