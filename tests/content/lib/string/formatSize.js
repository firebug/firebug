function runTest()
{
    var decimalMark = (0.1).toLocaleString().match(/\D/);

    var testValues = [
        {expected: "0 B", value: 0},
        {expected: "-1 B", value: -1},
        {expected: (1023).toLocaleString() + " B", value: 1023},
        {expected: (-1023).toLocaleString() + " B", value: -1023},
        {expected: "1" + decimalMark + "0 KB", value: 1024},
        {expected: "-1" + decimalMark + "0 KB", value: -1024},
        {expected: "1" + decimalMark + "0 KB", value: 1075},
        {expected: "-1" + decimalMark + "0 KB", value: -1075},
        {expected: (1.1).toLocaleString() + " KB", value: 1076},
        {expected: (-1.1).toLocaleString() + " KB", value: -1076},
        {expected: (1023.9).toLocaleString() + " KB", value: 1048524},
        {expected: (-1023.9).toLocaleString() + " KB", value: -1048524},
        {expected: "1" + decimalMark + "0 MB", value: 1048525},
        {expected: "-1" + decimalMark + "0 MB", value: -1048525},
        {expected: "1" + decimalMark + "00 KB", value: 1024, decimalPlaces: 2},
        {expected: "-1" + decimalMark + "00 KB", value: -1024, decimalPlaces: 2},
        {expected: (1.05).toLocaleString() + " KB", value: 1076, decimalPlaces: 2},
        {expected: (-1.05).toLocaleString() + " KB", value: -1076, decimalPlaces: 2},
        {expected: "1" + decimalMark + "00 MB", value: 1053818, decimalPlaces: 2},
        {expected: "-1" + decimalMark + "00 MB", value: -1053818, decimalPlaces: 2},
        {expected: (1.01).toLocaleString() + " MB", value: 1053819, decimalPlaces: 2},
        {expected: (-1.01).toLocaleString() + " MB", value: -1053819, decimalPlaces: 2}
    ];


    for (var i=0, len=testValues.length; i<len; ++i)
    {
        var value = testValues[i];
        var msg = "Formatted size for " + value.value;
        if (value.decimalPlaces)
        {
            FBTest.setPref("sizePrecision", value.decimalPlaces);
            var params = "decimal places: " + value.decimalPlaces;
            msg += " (" + params + ")";
        }
        else
        {
            FBTest.clearPref("sizePrecision");
        }
        msg += " must match expected format";

        FBTest.compare(value.expected, FW.FBL.formatSize(value.value), msg);
    }

    FBTest.testDone();
}
