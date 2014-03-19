function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/5451/issue5451.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("computed");

            FBTest.setPref("showUserAgentCSS", true);

            var panelNode = panel.panelNode;
            var groups = panelNode.getElementsByClassName("computedStylesGroup");
            var backgroundGroup = null;
            var backgroundHeader = null;
            for (var i=0, len=groups.length; i<len && !backgroundGroup; ++i)
            {
                var header = groups[i].getElementsByClassName("cssComputedHeader")[0];
                if (header.textContent == FW.FBL.$STR("StyleGroup-background"))
                {
                    backgroundGroup = groups[i];
                    backgroundHeader = header;
                }
            }

            // Resize the Firebug frame, so that the whole "Background" group
            // fits into the viewport of the Computed side panel
            FBTest.setFirebugBarHeight(backgroundGroup.offsetHeight + 80);

            panelNode.scrollTop = backgroundGroup.offsetTop - 10;

            FBTest.click(backgroundHeader);
            if (FBTest.ok(!FW.FBL.hasClass(backgroundGroup, "opened"),
                "'Background' group must be collapsed"))
            {
                // Verify that the panel isn't scrolled when the whole group fits into the viewport
                // after expanding it
                FBTest.click(backgroundHeader);
                FBTest.ok(FW.FBL.hasClass(backgroundGroup, "opened"),
                    "'Background' group must be expanded");
                FBTest.compare(backgroundGroup.offsetTop - 10, panelNode.scrollTop,
                    "Panel must not be scrolled");

                // Verify scrolling is working correctly when expanding while only the upper part
                // of the group is visible and the whole group fits into the panel
                panelNode.scrollTop = backgroundGroup.offsetTop - backgroundGroup.offsetHeight + 20;
                FBTest.click(backgroundHeader);
                FBTest.click(backgroundHeader);
                FBTest.compare(
                        backgroundGroup.offsetTop - (panelNode.offsetHeight - backgroundGroup.offsetHeight),
                        panelNode.scrollTop,
                "Whole 'Background' group must be visible at the bottom of the panel");

                // Verify scrolling is working correctly when expanding while the group header is
                // just partly visible
                panelNode.scrollTop = backgroundGroup.offsetTop + 10;
                FBTest.click(backgroundHeader);
                FBTest.click(backgroundHeader);
                FBTest.compare(backgroundGroup.offsetTop, panelNode.scrollTop,
                    "Whole 'Background' group must be visible at the top of the panel");

                // Verify scrolling is working correctly when expanding while the group doesn't fit
                // into the panel's viewport
                FBTest.setFirebugBarHeight(backgroundGroup.offsetHeight);
                panelNode.scrollTop = backgroundGroup.offsetTop - 10;
                FBTest.click(backgroundHeader);
                FBTest.click(backgroundHeader);
                FBTest.compare(backgroundGroup.offsetTop, panelNode.scrollTop,
                    "Part of the 'Background' group must be visible at the top of the panel");
            }

            FBTest.testDone();
        });
    });
}
