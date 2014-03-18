function runTest()
{
    FBTest.openNewTab(basePath + "cookies/general/cookieValues.php", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function()
        {
            // 2. Enable and switch to the Cookies panel
            FBTest.enableCookiesPanel(function(win)
            {
                var panelNode = FBTest.getSelectedPanel().panelNode;

                var cookieHeaderRow = panelNode.getElementsByClassName("cookieHeaderRow")[0];

                // 3. Right-click the Cookies panel column header and check <em>Raw Value</em>
                FBTest.executeContextMenuCommand(cookieHeaderRow,
                        {label: FW.FBL.$STR("cookies.header.rawValue")}, function ()
                {
                    var cookieValueCol = panelNode.getElementsByClassName("cookieValueCol")[0];
                    var cookieValueColDisplay = panelNode.ownerDocument.defaultView.
                        getComputedStyle(cookieValueCol).display;
                    FBTest.compare("table-cell", cookieValueColDisplay,
                        "'Value' column must be displayed");

                    var row = FBTest.getCookieRowByName(panelNode, "cookieValue");
                    var rowValue = row.getElementsByClassName("cookieValueLabel")[0];
                    FBTest.compare("1 + 2 = 3", rowValue.textContent,
                        "Unescaped value of the cookie in row must be correct");

                    var cookieRawValueCol = panelNode.getElementsByClassName("cookieRawValueCol")[0];
                    var cookieRawValueColDisplay = panelNode.ownerDocument.defaultView.
                        getComputedStyle(cookieRawValueCol).display;
                    FBTest.compare("table-cell", cookieRawValueColDisplay,
                        "'Raw Value' column must be displayed");

                    var rowRawValue = row.getElementsByClassName("cookieRawValueLabel")[0];
                    FBTest.compare("1+%2B+2+%3D+3", rowRawValue.textContent,
                        "Escaped value of the cookie in row must be correct");

                    // 4. Expand the cookie
                    row = FBTest.expandCookie(panelNode, "cookieValue");

                    var infoValue = row.getElementsByClassName("cookieInfoValueText")[0];
                    FBTest.compare("1 + 2 = 3", infoValue.textContent,
                        "Unescaped value of the cookie in detailed info must be correct");

                    // 5. Switch to the "Raw Data" tab
                    FBTest.expandElements(row, "cookieInfoRawValueTab");

                    var infoRawValue = row.getElementsByClassName("cookieInfoRawValueText")[0];
                    FBTest.compare("1+%2B+2+%3D+3", infoRawValue.textContent,
                        "Escaped value of the cookie in detailed info must be correct");

                    // Finish test
                    FBTest.testDone();
                });
            });
        });
    });
};
