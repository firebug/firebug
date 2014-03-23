function runTest()
{
    FBTest.openNewTab(basePath + "console/5235/issue5235.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableConsolePanelAndReload(() =>
            {
                var styleConfig = {tagName: "div", classes: "logRow", count: 2};
                FBTest.waitForDisplayedElement("console", styleConfig, () =>
                {
                    var panelNode = FBTest.getSelectedPanel().panelNode;
                    var style = panelNode.querySelector(
                        ".logRow:not(.logRow-command) .objectLink");
                    FBTest.executeContextMenuCommand(style, "InspectInstylesheetPanel", () =>
                    {
                        var cssPanel = FBTest.getSelectedPanel();
                        FBTest.compare("stylesheet", cssPanel.name, "CSS panel must be selected");

                        var computedStyleConfig = {
                            tagName: "div",
                            classes: "logRow",
                            count: 2,
                            onlyMutations: true
                        };
                        FBTest.waitForDisplayedElement("console", computedStyleConfig, () =>
                        {
                            var computedStyle = panelNode.querySelectorAll(
                                ".logRow:not(.logRow-command) .objectLink")[1];
                            FBTest.checkIfContextMenuCommandExists(computedStyle,
                                    "InspectInstylesheetPanel", (exists) => {
                                FBTest.ok(!exists, "Menu option for inspecting inside the CSS " +
                                    "panel must not be shown");
                                FBTest.testDone();
                            });
                        });

                        FBTest.executeCommand(
                            "getComputedStyle(document.getElementById('element'))");
                    }, FBTest.testDone);
                });

                FBTest.executeCommand("document.styleSheets[1].cssRules[0].style");
            });
        });
    });
}
