// Test response.
var bodyContent = "<span style=\"color: green;\">Response for Issue700.html</span>";
var htmlResponse = "<html><head/><body>" + bodyContent + "</body></html>";

// Test entry point.
function runTest()
{
    FBTest.openNewTab(basePath + "net/700/issue700.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            win.postRequest(function(request)
            {
                var panelNode = FBTest.selectPanel("net").panelNode;
                FBTest.expandElements(panelNode, "netRow", "category-xhr");
                setTimeout(expandHTMLPreview, 500);
            });
        });
    });
}

function expandHTMLPreview()
{
    var panelNode = FBTest.getPanel("net").panelNode;
    FBTest.expandElements(panelNode, "netInfoHtmlTab");
    setTimeout(checkHTMLPreview, 500);
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
