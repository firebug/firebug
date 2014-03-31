window.FBTestTimeout = 13000; // override the default test timeout [ms].

function runTest()
{
    var startTime = new Date().getTime();

    var responseText = "$('tb').shake();\n$('tb').value='Some Response';\n";

    FBTest.openNewTab(basePath + "net/1456/issue1456.htm", function(win)
    {
        var time = new Date().getTime();
        FBTest.progress("opened "+win.location+" at "+ (time - startTime)+"ms");

        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            var time = new Date().getTime();
            FBTest.progress("enabled net panel at "+ (time - startTime)+"ms");

            var options = {tagName: "tr", classes: "netRow category-xhr hasHeaders loaded"};
            FBTest.waitForDisplayedElement("net", options, function(row)
            {
                var time = new Date().getTime();
                FBTest.progress("onResponse at "+ (time - startTime)+"ms");

                FBTest.sysout("issue1456.onResponse: ", row);

                var panelNode = FW.Firebug.chrome.selectPanel("net").panelNode;

                var time = new Date().getTime();
                FBTest.progress("onResponse selectPanel complete"+ (time - startTime)+"ms");

                // Expand the test request with params
                FBTest.click(row);
                FBTest.expandElements(row.nextSibling, "netInfoResponseTab");

                var time = new Date().getTime();
                FBTest.progress("onResponse expandElements complete"+ (time - startTime)+"ms");

                // The response must be displayed.
                var responseBody = FW.FBL.getElementByClass(row.nextSibling,
                    "netInfoResponseText", "netInfoText");

                FBTest.ok(responseBody, "Response tab must exist.");
                if (responseBody)
                {
                    // Get response text properly formatted from the response tab.
                    var lines = [];
                    var children = responseBody.firstChild.childNodes;
                    for (var i=0; i<children.length; i++)
                        lines.push(children[i].textContent);

                    FBTest.compare(responseText, lines.join(""), "Response must match.");
                }

                var time = new Date().getTime();
                FBTest.progress("done at "+ (time - startTime)+"ms");

                // Finish test
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    })
}
