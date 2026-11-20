package com.example;

import com.google.appinventor.components.runtime.AndroidNonvisibleComponent;
import com.google.appinventor.components.runtime.ComponentContainer;
import com.google.appinventor.components.annotations.DesignerComponent;
import com.google.appinventor.components.annotations.SimpleFunction;
import com.google.appinventor.components.common.ComponentCategory;

@DesignerComponent(version = 1,
                   description = "A component to perform string manipulations.",
                   category = ComponentCategory.EXTENSION,
                   nonVisible = true,
                   iconName = "images/extension.png")
public class StringTools extends AndroidNonvisibleComponent {

    public StringTools(ComponentContainer container) {
        super(container.$form());
    }

    @SimpleFunction(description = "Reverses the given text.")
    public String Reverse(String text) {
        return new StringBuilder(text).reverse().toString();
    }
}
