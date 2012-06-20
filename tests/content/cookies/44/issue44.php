<?php
    setcookie("TestCookie44-JSON", "{person: {firstName: 'Jan', secondName: 'Honza', lastName: 'Odvarko'}}", time() + 86400, "/firecookie/tests/issue44", "", false, false);
    setcookie("TestCookie44-XML", "<person><firstname>Jan</firstname><secondname>Honza</secondname><lastname>Odvarko</lastname></person>", time() + 86400, "/firecookie/tests/issue44", "", false, false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Test Case for Issue #44</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<h1>Issue #44</h1>

<p>This test-case is intended for <a href="http://code.google.com/p/firecookie/issues/detail?id=44">
    Issue #44</a> JSON Cookies view.
<br/>
<i>Jan Odvarko, odvarko@gmail.com</i>
</p>

<ol>
<li>Open Firebug and select <b>Cookies</b> panel.</li>
<li>Expand the <i>TestCookie44-JSON</i> cookie and select JSON tab.</li>
<li>Expand the <i>TestCookie44-XML</i> cookie and select XML tab.</li>
<li>Formatted cookie value should be displayed</li>
</ol>

<button onclick="console.log(document.cookie)">Test</button>
</body>
</html>
