'use strict';

/* global CloudCmd, DOM, io */

const rendy = require('rendy');
const exec = require('execon');
const currify = require('currify/legacy');
const input = require('./input');

CloudCmd.Config = ConfigProto;

function ConfigProto() {
    const config = CloudCmd.config;
    const Key = CloudCmd.Key;
    const Dialog = DOM.Dialog;
    
    const TITLE = 'Config';
    const alert = currify(Dialog.alert, TITLE);
    
    const Images = DOM.Images;
    const Events = DOM.Events;
    const Files = DOM.Files;
    
    const showLoad    = () => {
        Images.show.load('top');
    };
    
    const Notify = DOM.Notify;
    const Config = this;
    
    let Loading = true;
    let Element;
    let Template;
    
    function init() {
        Loading     = true;
        
        showLoad();
        exec.series([
            CloudCmd.View,
            (callback) => {
                Loading = false;
                exec(callback);
                DOM.loadSocket(initSocket);
            },
            Config.show
        ]);
    }
    
    function getHost() {
        const {host, origin, protocol} = location;
        const href = origin || `${protocol}//${host}`;
        
        return href;
    }
    
    function initSocket(error) {
        const href = getHost();
        const prefix = CloudCmd.PREFIX;
        const FIVE_SECONDS = 5000;
        const save = (data) => {
            onSave(data);
            socket.send(data);
        };
            
        if (error)
            return;
        
        const socket  = io.connect(href + prefix + '/config', {
            'max reconnection attempts' : Math.pow(2, 32),
            'reconnection limit'        : FIVE_SECONDS,
            path: prefix + '/socket.io'
        });
        
        authCheck(socket);
        
        socket.on('connect', () => {
            Config.save = save;
        });
        
        socket.on('config', (config) => {
            DOM.Storage.setAllowed(config.localStorage);
        });
        
        socket.on('message', onSave);
        socket.on('log', CloudCmd.log);
        
        socket.on('disconnect', () => {
            Config.save = saveHttp;
        });
        
        socket.on('err', alert);
    }
    
    function authCheck(socket) {
        if (!config('auth'))
            return;
        
        socket.emit('auth', config('username'), config('password'));
        
        socket.on('reject', () => {
            alert('Wrong credentials!');
        });
    }
    
    Config.save = saveHttp;
    
    this.show = () => {
        const prefix = CloudCmd.PREFIX;
        const funcs = [
            exec.with(Files.get, 'config-tmpl'),
            exec.with(DOM.load.parallel, [
                prefix + '/css/config.css'
            ])
        ];
        
        if (Loading)
            return;
        
        showLoad();
        exec.parallel(funcs, fillTemplate);
    };
    
    function fillTemplate(error, template) {
        if (!Template)
            Template = template;
        
        Files.get('config', (error, config) => {
            if (error)
                return alert('Could not load config!');
            
            const obj = input.convert(config);
            
            obj[obj.editor + '-selected'] = 'selected';
            delete obj.editor;
            
            obj[obj.packer + '-selected'] = 'selected';
            delete obj.packer;
            
            const inner = rendy(Template, obj);
            
            Element = DOM.load({
                name        : 'div',
                className   : 'config',
                inner,
                attribute   : {
                    'data-name': 'js-config'
                }
            });
            
            const inputs = document.querySelectorAll('input, select', Element);
            const inputFirst = inputs[0];
            
            let afterShow;
            if (inputFirst) {
                onAuthChange(inputFirst.checked);
                
                afterShow = () => {
                    inputFirst.focus();
                };
            }
            
            [...inputs].forEach((input) => {
                Events.addKey(input, onKey)
                    .add('change', input, ({target}) => {
                        onChange(target);
                    });
            });
            
            const autoSize = true;
            CloudCmd.View.show(Element, {
                autoSize,
                afterShow,
            });
        });
    }
    
    this.hide = () => {
        CloudCmd.View.hide();
    };
    
    function onChange(el) {
        var obj     = {},
            name    = input.getName(el),
            data    = input.getValue(name, Element),
            type    = el.type;
        
        if (type === 'checkbox')
            if (/^(diff|buffer|dirStorage)$/.test(name))
                onLSChange(name, data);
            else if (name === 'localStorage')
                onLocalStorageChange();
            else if (name === 'auth')
                onAuthChange(data);
        
        if (name === 'notifications') {
            if (data && !Notify.check())
                Notify.request();
        }
        
        obj[name] = data;
        
        Config.save(obj);
    }
    
    function onSave(obj) {
        Object.keys(obj).forEach((name) => {
            const data = obj[name];
            
            CloudCmd._config(name, data);
            input.setValue(name, data, Element);
        });
        
        DOM.Storage.setAllowed(obj.localStorage);
    }
    
    function saveHttp(obj) {
        const {RESTful} = DOM;
        
        RESTful.Config.write(obj, (error) => {
            if (error)
                return;
            
            onSave(obj);
        });
    }
    
    function onLocalStorageChange() {
        var names           = ['diff', 'buffer', 'dirStorage', 'localStorage'],
            elements        = names.map((name) => {
                return input.getElementByName(name, Element);
            }),
            
            el              = {},
            msg             = 'Diff, Buffer and Directory Storage do not work without localStorage',
            isChecked;
            
        elements.forEach((element) => {
            const name = input.getName(element);
            
            el[name] = element;
            
            if (element.checked)
                isChecked = true;
        });
        
        if (!isChecked || el.localStorage.checked)
            return;
        
        alert(msg);
        
        elements.forEach((element) => {
            if (!element.checked)
                return;
                
            element.checked = false;
            onChange(element);
        });
    }
    
    function onLSChange(name, data) {
        const elLocalStorage = input.getElementByName('localStorage', Element);
        const msg = `${name} depends on localStorage`;
        
        if (!data || elLocalStorage.checked)
            return;
        
        Dialog.alert(TITLE, msg);
        elLocalStorage.checked = true;
    }
    
    function onAuthChange(checked) {
        const elUsername = input.getElementByName('username', Element);
        const elPassword = input.getElementByName('password', Element);
        
        elUsername.disabled =
        elPassword.disabled = !checked;
    }
    
    function onKey({keyCode, target}) {
        switch (keyCode) {
        case Key.ESC:
            Config.hide();
            break;
        
        case Key.ENTER:
            onChange(target);
            break;
        }
    }
    
    if (!CloudCmd.config('configDialog'))
        return;
   
    init();
}

