function runTest()
{
    // Valid values
    verifyResult("#000000", "rgb(0, 0, 0)");
    verifyResult("#000000", "rgb(0,0,0)");
    verifyResult("#ffffff", "rgb(255, 255, 255)");
    verifyResult("rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0)");
    verifyResult("#008000", "green");
    verifyResult("#8b0000", "darkred");
    verifyResult("#6495ed", "CornflowerBlue");
    verifyResult("rgba(0, 0, 0, 0)", "transparent");

    // Invalid values
    verifyResult("notanrgbcolor", "notanrgbcolor");

    FBTest.testDone();
}

function verifyResult(expected, color)
{
    var result = FW.FBL.rgbToHex(color);
    FBTest.compare(expected, result,
        "RGB color must be correctly converted to hexadecimal format");
}