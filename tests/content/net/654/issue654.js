function runTest()
{
    FBTest.openNewTab(basePath + "net/654/issue654.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Enable and switch to the Net panel
            FBTest.enableNetPanel(function(win)
            {
                // 3. Reload the page
                FBTest.reload(function ()
                {
                    // TODO 4. Right-click the <em>Net</em> panel's header and check the "Local IP" entry

                    var config = {
                        tagName: "tr",
                        classes: "netRow category-xhr hasHeaders loaded"
                        // There is already one request displayed in the Net panel,
                        // so make sure the test is waiting for new entry (not the existing one)
                        //onlyMutations: true
                    };

                    FBTest.waitForDisplayedElement("net", config, function(row)
                    {
                        var panelNode = FBTest.getSelectedPanel().panelNode;
                        var localIPs = panelNode.querySelectorAll(".netLocalAddressCol .netAddressLabel");
                        var remoteIPs = panelNode.querySelectorAll(".netRemoteAddressCol .netAddressLabel");

                        FBTest.compare(3, localIPs.length, "There must be three local IPs");
                        FBTest.compare(3, remoteIPs.length, "There must be three remote IPs");

                        if (localIPs.length == 3 && remoteIPs.length == 3)
                        {
                            var reIP = /^((?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]*?\])\:\d{1,5}$/;
                            var ordinals = ["First", "Second", "Third"];

                            for (var i = 0; i < 3; i++)
                            {
                                FBTest.progress(ordinals[i] + " local IP: " + localIPs[i].textContent);
                                FBTest.compare(reIP, localIPs[i].textContent,
                                    ordinals[i] + " entry for local IP address and port number should " +
                                        "be a valid IP address");

                                FBTest.progress(ordinals[i] + " remote IP: " + remoteIPs[1].textContent);
                                FBTest.compare(reIP, remoteIPs[1].textContent,
                                    ordinals[i] + " entry for remote IP address and port number should " +
                                        "be be a valid IP address");
                            }
                        }

                        FBTest.testDone();
                    });

                    // 5. Click the "Make request" button
                    FBTest.click(win.document.getElementById("makeRequest"));
                });
            });
        });
    });
}
