function runTest()
{
    FBTest.sysout("issue6540.START");

    FBTest.openNewTab(basePath + "css/selectors/6540/issue6540.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectSidePanel("selectors");

        FBTest.addSelectorTrial(null, "#test > div:not(:empty)", function(objectLink) {
            var panelNode = panel.panelNode;
            var divs = panelNode.getElementsByClassName("objectLink-element");

            if (FBTest.compare(1, divs.length, "There must be one <div> listed"))
            {
                clickAndVerify(win, "removeDIV", 0, "There must be no <div>s listed", function () {
                    clickAndVerify(win, "addDIV", 1, "There must be one <div> listed",
                        function ()
                        {
                            clickAndVerify(win, "changeText", 0, "There must be no <div>s listed",
                                function () {
                                    FBTest.testDone("issue6540.DONE");
                                }
                            );
                        }
                    );
                });
            }
            else
            {
                FBTest.testDone("issue6540.DONE");
            }
        });
    });
}

function clickAndVerify(win, id, expected, msg, callback)
{
    var config = {
        tagName: "a",
        classes: "objectLink-element"
    };

    FBTest.waitForDisplayedElement("selectors", config, function(row)
    {
        var panelNode = FBTest.getSelectedSidePanel().panelNode;
        var divs = panelNode.getElementsByClassName("objectLink-element");
        if (FBTest.compare(expected, divs.length, msg))
            callback();
        else
            FBTest.testDone("issue6540.DONE");
    });

    var button = win.document.getElementById(id);
    FBTest.click(button);
}
