function runTest()
{
    FBTest.sysout("issue654.START");

    // This test is only for FF5+
    if (FBTest.compareFirefoxVersion("5") < 0)
    {
        FBTest.testDone("issue654.DONE");
        return;
    }

    // Make sure all net panel columns are displayed.
    FBTest.setPref("net.hiddenColumns", "");

    FBTest.openNewTab(basePath + "net/654/issue654.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.selectPanel("net");

            onRequestDisplayed(function(row)
            {
                // Expand Net's panel UI so, it's populated with data.
                var panelNode = FBTest.getPanel("net").panelNode;
                var localIPs = panelNode.querySelectorAll(".netLocalAddressCol .netAddressLabel");
                var remoteIPs = panelNode.querySelectorAll(".netRemoteAddressCol .netAddressLabel");

                FBTest.compare(2, localIPs.length, "There must be two Local IPs");
                FBTest.compare(2, remoteIPs.length, "There must be two Remote IPs");

                if (localIPs.length == 2 && remoteIPs.length == 2)
                {
                    var reIP = /\b(?:\d{1,3}\.){3}\d{1,3}\:\d{1,5}\b/;
                    FBTest.compare(reIP, localIPs[0].textContent, "IP address and port number is expected.");
                    FBTest.compare(reIP, localIPs[1].textContent, "IP address and port number is expected.");
                    FBTest.compare(reIP, remoteIPs[0].textContent, "IP address and port number is expected.");
                    FBTest.compare(reIP, remoteIPs[1].textContent, "IP address and port number is expected.");
                }

                FBTest.testDone("issue654.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function onRequestDisplayed(callback)
{
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "netRow category-xhr loaded"});
    recognizer.onRecognizeAsync(callback);
}
