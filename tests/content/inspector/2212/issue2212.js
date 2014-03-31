function runTest()
{
    FBTest.openNewTab(basePath + "inspector/2212/issue2212.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the HTML panel
            var panelNode = FBTest.selectPanel("html").panelNode;

            var target = win.document.getElementById("elementToInspect");
            // 3. Enable the Inspector
            // 4. Hover the blue <div> (#elementToInspect)
            FBTest.inspectElement(target, true);

            var observer = new MutationObserver(() =>
            {
                if (FBTest.ok(!win.document.getElementById("elementToInspect"),
                    "Element '#elementToInspect' should be removed from the page"))
                {
                    observer.disconnect();

                    FBTest.stopInspecting();

                    FBTest.selectElementInHtmlPanel("content", (nodeBox) =>
                    {
                        FBTest.ok(nodeBox.getElementsByClassName("nodeBox").length === 0,
                            "Element '#elementToInspect' should be removed from the HTML panel");
                        FBTest.testDone();
                    });
                }
            });

            var config = {childList: true};
            var content = win.document.getElementById("content");
            observer.observe(content, config);

            // 5. Press Del
            win.setTimeout(() => FBTest.sendShortcut("VK_DELETE"), 100);
        });
    });
}
