(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    // Reorder single clinic page so the DOCTOR block appears right after the logo image.
    // IMPORTANT: #post_list2 is reused by the MEDIA section on the same page, so we must
    // distinguish the doctor block (has .cat-category tags) from media items (no tags).
    function reorderSingleClinic() {
        var article = document.getElementById("article");
        if (!article) return;
        var postImage = document.getElementById("post_image");
        if (!postImage) return;

        var movedElements = [];
        var seen = function (el) { return movedElements.indexOf(el) !== -1; };

        var children = Array.prototype.slice.call(article.children);

        // 1) DOCTOR heading div (direct child with <p>/<P> text === "DOCTOR")
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "div" && !seen(child)) {
                var p = child.querySelector("p, P");
                if (p && p.textContent && p.textContent.trim() === "DOCTOR") {
                    movedElements.push(child);
                }
            }
        });

        // 2) <center> wrappers containing #post_list2 WITH .cat-category tags
        //    (these are the doctor portrait blocks; MEDIA items have no cat tags)
        function isDoctorCenter(center) {
            if (!center.querySelector("#post_list2")) return false;
            return !!center.querySelector(".cat-category, .cat-category2, .cat-category3");
        }

        var allCenters = article.querySelectorAll("center");
        Array.prototype.forEach.call(allCenters, function (center) {
            if (!seen(center) && isDoctorCenter(center)) {
                movedElements.push(center);
            }
        });

        // 3) Doctor detail div (contains "診療科" / "専門医" / "出身大学" / "大学")
        var detailKeywords = ["診療科", "専門医", "出身大学", "大学："];
        children.forEach(function (child) {
            if (!child.tagName || child.tagName.toLowerCase() !== "div" || seen(child)) return;
            var text = (child.textContent || "").replace(/\s+/g, "");
            if (text.length < 8 || text.length > 400) return;
            var hit = detailKeywords.some(function (kw) { return text.indexOf(kw) !== -1; });
            if (hit) movedElements.push(child);
        });

        if (movedElements.length === 0) return;

        // Insertion point: right after #post_image
        var anchor = postImage.nextSibling;
        movedElements.forEach(function (el) {
            article.insertBefore(el, anchor);
            anchor = el.nextSibling;
        });
    }

    // Per-clinic YouTube URL overrides. The site stores clinic content in TCD pagebuilder
    // meta fields, so patching specific SNS icon links is easier from the client side.
    var CLINIC_YOUTUBE = {
        "kokoromental": "https://www.youtube.com/watch?v=xCg6wNiL8BQ"
    };

    function patchClinicYouTube() {
        var slugMatch = window.location.pathname.match(/^\/([^/]+)\/?$/);
        if (!slugMatch) return;
        var slug = slugMatch[1];
        var url = CLINIC_YOUTUBE[slug];
        if (!url) return;

        // Find anchors whose image src ends with /3.png — these are the YouTube icons
        var anchors = document.querySelectorAll('a img[src*="/2024/06/3.png"]');
        Array.prototype.forEach.call(anchors, function (img) {
            var a = img.closest("a");
            if (!a) return;
            var current = (a.getAttribute("href") || "").trim();
            if (current === "" || current === "#") {
                a.setAttribute("href", url);
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
            }
        });
    }

    // Parent theme JS sets .inview-fadein{opacity:0} and then animates in — that delays
    // the hero caption. Force caption visible immediately and keep it visible.
    function forceHeroVisible() {
        var selectors = [
            "#header_slider",
            "#header_slider .item",
            "#header_slider .slick-slide",
            "#header_slider .caption",
            "#header_slider .caption .headline",
            "#header_slider .caption .catchphrase"
        ];
        selectors.forEach(function (sel) {
            var els = document.querySelectorAll(sel);
            Array.prototype.forEach.call(els, function (el) {
                el.style.opacity = "1";
                el.style.visibility = "visible";
            });
        });
    }

    ready(function () {
        forceHeroVisible();
        // Re-run after slick likely initializes (next tick + short delays)
        setTimeout(forceHeroVisible, 0);
        setTimeout(forceHeroVisible, 100);
        setTimeout(forceHeroVisible, 500);

        reorderSingleClinic();
        patchClinicYouTube();

        var targets = document.querySelectorAll(
            "#post_list .article, #main_contents h2, #main_contents h3, .widget, #post_list2 .article"
        );
        targets.forEach(function (el) {
            el.classList.add("gm-reveal");
        });

        if (!("IntersectionObserver" in window)) {
            targets.forEach(function (el) { el.classList.add("is-in"); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-in");
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        targets.forEach(function (el) { io.observe(el); });
    });
})();
