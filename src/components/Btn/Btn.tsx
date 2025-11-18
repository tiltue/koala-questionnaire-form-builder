import React from 'react';
import './Btn.css';

type BtnProps = {
    title: string;
    onClick?: () => void;
    id?: string;
    type?: 'button' | 'submit' | 'reset';
    icon?: 'ion-plus-round' | 'ion-ios-trash';
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
};

const Btn = ({
    title,
    onClick,
    id,
    type = 'button',
    icon,
    variant = 'primary',
    disabled = false,
}: BtnProps): JSX.Element => {
    return (
        <button type={type} className={`regular-btn ${variant}`} id={id} onClick={onClick} disabled={disabled}>
            {icon && <i className={icon} />} {title}
        </button>
    );
};

export default Btn;
