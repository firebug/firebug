<?php
    setcookie("TestCookie54", "-!-", time() + 86400, "/firecookie/tests/issue54", "", false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Test Case for Issue #54</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<h1>Issue #54</h1>

<p>This test-case is intended for <a href="http://code.google.com/p/firecookie/issues/detail?id=54">Issue #54</a>
urlencoding of cookies value
<br/>
<i>Jan Odvarko, odvarko@gmail.com</i>
</p>

<ol>
<li>Open Firebug and select the <b>Cookies</b> panel.</li>
<li>Right click on the 'TestCookie54' cookie and pick <i>Edit</i> menu item.</li>
<li>Don't touch anything in the dialog and just press OK.</li>
<li>The cookie is escaped -> BUG</li>
</ol>

<i>The original cookie value is: </i><code style="color:green">-!-</code>

</body>
</html>
