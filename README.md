Firebug
=======
*Web Development Evolved* [getfirebug.com](https://getfirebug.com)

**On November 14, with the launch of Firefox Quantum (AKA 57), support for old school extensions will stop in Firefox. That means Firebug will no longer work for many developers. However, the work continues in the great Firefox devtools. You can try Firefox devtools by updating your [release browser](https://www.mozilla.org/en-US/firefox/new/?utm_source=github&utm_campaign=switch) or [downloading Developer Edition](https://www.mozilla.org/en-US/firefox/developer/?utm_source=github&utm_campaign=switch). Read more [here](https://hacks.mozilla.org/2017/10/saying-goodbye-to-firebug/)**

[Download](https://addons.mozilla.org/en-US/firefox/addon/firebug/)

License
-------
Firebug is free and open source software distributed under the
[BSD License](https://github.com/firebug/firebug/blob/master/extension/license.txt).


Source Repository Structure
---------------------------
See [more](https://getfirebug.com/wiki/index.php/Source) information about Firebug
repository structure.


* **extension** Firebug extension directory.
* **tests** Firebug automated test files and test harness.
* **trace** Firebug tracing console.


Build Firebug XPI
-----------------
In order to build Firebug *.xpi package run following in your command line
(you need [Apache Ant](http://ant.apache.org/))

    $ cd firebug/extension
    $ ant

The *.xpi file should be located within `./release` directory.


Run Firebug From Source
-----------------------
The *extension* directory directly contains Firebug extension files and so, you can run
Firebug directly from it. This is the recommended way how to quickly test your code
changes and provide a patch.

1. Locate your Firefox [profile folder](http://kb.mozillazine.org/Profile_folder)
2. Open `extensions/` folder, create if it doesn't exist.
3. Create a new text file and put the full path to your development folder inside.
(e.g. `C:\firebug\extension\` or `~/firebug/extension/`). Windows users should retain the OS'
slash direction, and everyone should remember to include a closing slash and remove any
trailing spaces.
4. Save the file with Firebug ID as it's name `firebug@software.joehewitt.com`


Hacking on Firebug
------------------
See detailed [instructions](http://www.softwareishard.com/blog/firebug/hacking-on-firebug/)
about how to provide a patch to Firebug source.


Further Resources
-----------------

* Home: [https://getfirebug.com/](https://getfirebug.com/)
* Blog: [https://blog.getfirebug.com/](https://blog.getfirebug.com/)
* Twitter: [https://twitter.com/#!/firebugnews](https://twitter.com/#!/firebugnews)
* Discussion Group: [https://groups.google.com/forum/?fromgroups#!forum/firebug](https://groups.google.com/forum/?fromgroups#!forum/firebug)
* Wiki: [https://getfirebug.com/wiki](https://getfirebug.com/wiki/index.php/Main_Page)
* Report an Issue: [http://code.google.com/p/fbug/issues/list](http://code.google.com/p/fbug/issues/list)
* Firebug Extensions: [https://getfirebug.com/extensions](https://getfirebug.com/wiki/index.php/Firebug_Extensions)
