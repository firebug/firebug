function runTest()
{
    // Valid values
    verifyResult("hsl(0, 0%, 0%)", "rgb(0, 0, 0)");
    verifyResult("hsl(0, 0%, 0%)", "rgb(0,0,0)");
    verifyResult("hsl(0, 0%, 100%)", "rgb(255, 255, 255)");
    verifyResult("hsla(0, 0%, 100%, 0)", "rgba(255, 255, 255, 0)");
    verifyResult("hsla(0, 0%, 100%, 0.5)", "rgba(255, 255, 255, 0.5)");
    verifyResult("hsl(120, 100%, 25%)", "green");
    verifyResult("hsl(0, 100%, 27%)", "darkred");
    verifyResult("hsl(219, 79%, 66%)", "CornflowerBlue");
    verifyResult("hsla(0, 0%, 0%, 0)", "transparent");

    // Invalid values
    verifyResult("notanrgbcolor", "notanrgbcolor");

    FBTest.testDone();
}

function verifyResult(expected, color)
{
    var result = FW.FBL.rgbToHSL(color);
    FBTest.compare(expected, result,
        "RGB color must be correctly converted to HSL format");
}