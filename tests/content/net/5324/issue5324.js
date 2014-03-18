function runTest()
{
    FBTest.openNewTab(basePath + "net/5324/issue5324.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.selectPanel("net");

            waitForXHR(function(row)
            {
                var label = row.getElementsByClassName("netProtocolLabel")[0];
                FBTest.compare(/SPDY/, label.innerHTML, "It must be a SPDY request");
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function waitForXHR(callback)
{
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "netRow category-xhr loaded"});
    recognizer.onRecognizeAsync(callback);
}
