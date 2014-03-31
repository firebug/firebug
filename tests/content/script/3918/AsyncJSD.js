/**
 * 1) Disable all panels
 * 2) Open a new tab and Firebug UI on it.
 * 3) Step by step enable alls panels and verify they are enabled.
 * 4) Reload page and check all panels again (must be still enabled).
 */
function runTest()
{
    FBTest.disableAllPanels();
    FBTest.progress("All panels start disabled");
    FBTest.setPref("activateSameOrigin", false);
    FBTest.progress("The Activate Same Origin Option is false for this test");

    FBTest.openNewTab(basePath + "script/3918/AsyncJSDPage.html", function(win)
    {
        FBTest.progress("opened tab for "+win.location);
        FBTest.openFirebug(function()
        {
            FBTest.progress("Script panels should be disabled: check it");

            // All panels must be disabled.
            checkIsDisabled(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);

            FBTest.progress("Enable script panel and check them");

            // Enable and verify.
            try
            {
                enable(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);

                FBTest.reload(function()
                {
                    FBTest.progress("reloaded, check isEnabled");
                    // All panels must be still enabled.
                    checkIsEnabled(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);

                    FBTest.testDone();
                });
            }
            catch (err)
            {
                FBTest.sysout("exception", err);
            }
        });
    });
}

function enable(panelName, module)
{
    FBTest.selectPanelTab(panelName);
    FBTest.setPanelState(module, FBTest.getPanelTypeByName(panelName), null, true);
}

function checkIsDisabled(panelName, module)
{
    FBTest.selectPanelTab(panelName);

    FBTest.compare("true", FBTest.isPanelTabDisabled(panelName), "The "+panelName+" panel's module should be disabled");
    var selectedPanel = FBTest.getSelectedPanel();

    FBTest.ok(!selectedPanel, "The selected panel should be null");

    var icon = FW.top.document.getElementById('firebugStatus').getAttribute(panelName);
    FBTest.ok(!icon || (icon != "on"), "The "+panelName+" should NOT be marked on the Firebug Statusbar Icon, icon="+icon);
}

function checkIsEnabled(panelName, module)
{
    FBTest.selectPanelTab(panelName);

    FBTest.compare("false", FBTest.isPanelTabDisabled(panelName), "The "+panelName+" panel should be enabled");

    var panelType = FBTest.getPanelTypeByName(panelName);
    var selectedPanel = FBTest.getSelectedPanel();
    FBTest.compare(panelType, selectedPanel.name, "The selected panel should be "+panelName);
    if (selectedPanel.disabledBox)
    {
        FBTest.compare("true", selectedPanel.disabledBox.getAttribute("collapsed"),
            "The "+panelName+" should not have the disabled message");
    }

    var icon = FW.top.document.getElementById("firebugStatus").getAttribute(panelType);
    FBTest.compare("on", icon+"", "The "+panelName+" should be marked on the Firebug Statusbar Icon");
}