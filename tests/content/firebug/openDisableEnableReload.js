/**
 * 1) Disable all panels
 * 2) Open a new tab and Firebug UI on it.
 * 3) Step by step enable alls panels and verify they are enabled.
 * 4) Reload page and check all panels again (must be still enabled).
 */
function runTest()
{
    FBTest.disableAllPanels();

    FBTest.setPref("activateSameOrigin", false);
    FBTest.progress("The Activate Same Origin Option is false for this test");

    FBTest.openNewTab(basePath + "firebug/OpenFirebugOnThisPage.html", function(win)
    {
        FBTest.progress("opened tab for "+win.location);
        FBTest.openFirebug(function()
        {
            FBTest.progress("All panels should be disabled: check them");
            // All panels must be disabled.
            checkIsDisabled(FW.FBL.$STR("Panel-console"), FW.Firebug.Console);  // console must be disabled first
            checkIsDisabled(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);
            checkIsDisabled(FW.FBL.$STR("Panel-net"), FW.Firebug.NetMonitor);

            FBTest.progress("Enable all panels and check them");

            // Enable and verify.
            try
            {
                enableAndCheck(FW.FBL.$STR("Panel-net"), FW.Firebug.NetMonitor);
                enableAndCheck(FW.FBL.$STR("Panel-console"), FW.Firebug.Console);
                enableOnly(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);
            }
            catch (err)
            {
                FBTest.sysout("exception", err);
            }

            setTimeout(function()
            {
                checkIsEnabled(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);

                FBTest.reload(function()
                {
                    FBTest.progress("reloaded, check isEnabled");
                    // All panels must be still enabled.
                    checkIsEnabled(FW.FBL.$STR("Panel-script"), FW.Firebug.Debugger);
                    checkIsEnabled(FW.FBL.$STR("Panel-net"), FW.Firebug.NetMonitor);
                    checkIsEnabled(FW.FBL.$STR("Panel-console"), FW.Firebug.Console);

                    FBTest.testDone();
                });
            });
        });
    });
}

function enableOnly(panelName, module)
{
    FBTest.selectPanelTab(panelName);
    FBTest.setPanelState(module, FBTest.getPanelTypeByName(panelName), null, true);
}

function enableAndCheck(panelName, module)
{
    enableOnly(panelName, module);
    checkIsEnabled(panelName, module);
}

function checkIsDisabled(panelName, module)
{
    FBTest.selectPanelTab(panelName);

    FBTest.compare("true", FBTest.isPanelTabDisabled(panelName),
        "The "+panelName+" panel's module should be disabled");
    var selectedPanel = FBTest.getSelectedPanel();

    FBTest.ok(!selectedPanel, "The selected panel should be null");

    var icon = FW.top.document.getElementById('firebugStatus').getAttribute(panelName);
    FBTest.ok(!icon || (icon != "on"),
        "The "+panelName+" should NOT be marked on the Firebug Statusbar Icon");
}

function checkIsEnabled(panelName, module)
{
    FBTest.selectPanelTab(panelName);

    FBTest.compare("false", FBTest.isPanelTabDisabled(panelName),
        "The "+panelName+" panel should be enabled");

    var panelType = FBTest.getPanelTypeByName(panelName);
    var selectedPanel = FBTest.getSelectedPanel();
    FBTest.compare(panelType, selectedPanel.name,
        "The selected panel should be "+panelName);
    if (selectedPanel.disabledBox)
        FBTest.compare("true", selectedPanel.disabledBox.getAttribute("collapsed"),
            "The "+panelName+" should not have the disabled message");

    var icon = FW.top.document.getElementById("firebugStatus").getAttribute(panelType);
    FBTest.compare("on", icon+"",
        "The "+panelName+" should be marked on the Firebug Statusbar Icon");
}
